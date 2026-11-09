require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(__dirname));

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const seedBooks = [
  ["IT-101", "Introduction to Programming", "R. Domingo", "Foundations", 15],
  [
    "IT-102",
    "Data Structures and Algorithms",
    "M. Villanueva",
    "Foundations",
    12,
  ],
  ["IT-103", "Object-Oriented Programming", "J. Santos", "Foundations", 14],
  ["IT-201", "Database Management Systems", "A. Cruz", "Data", 8],
  ["IT-202", "Web Development Fundamentals", "K. Reyes", "Web", 10],
  ["IT-203", "Mobile Application Development", "P. Fernandez", "Web", 11],
  ["IT-204", "Cloud Computing Fundamentals", "L. Bautista", "Systems", 13],
  ["IT-301", "Computer Networks", "D. Aquino", "Systems", 9],
  ["IT-302", "Operating Systems", "E. Mercado", "Systems", 15],
  ["IT-303", "Information Assurance and Security", "N. Torres", "Security", 10],
  ["IT-401", "Software Engineering", "C. Ramos", "Engineering", 12],
  ["IT-402", "Systems Analysis and Design", "V. Garcia", "Engineering", 8],
  [
    "IT-403",
    "Human-Computer Interaction (UI/UX Design)",
    "S. Lopez",
    "Design",
    14,
  ],
  [
    "IT-404",
    "Artificial Intelligence Fundamentals",
    "F. Navarro",
    "Emerging Tech",
    11,
  ],
  ["IT-405", "Capstone Project Management", "B. Castillo", "Engineering", 13],
].map(([id, title, author, category, quantity]) => ({
  id,
  title,
  author,
  category,
  quantity,
  available: true,
  createdAt: new Date(),
}));

let db;
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, message, code) =>
  res.status(status).json({ message, code });
const clean = (value) => (typeof value === "string" ? value.trim() : "");
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const strongPassword = (password) =>
  typeof password === "string" &&
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
const today = () => new Date().toISOString().slice(0, 10);
const tokenFrom = (req) =>
  (req.get("authorization") || "").replace(/^Bearer\s+/i, "");

function sessionHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
async function tokenFor(subject, role) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.collection("sessions").insertOne({
    tokenHash: sessionHash(token),
    subject,
    role,
    expiresAt: new Date(Date.now() + SESSION_MS),
    createdAt: new Date(),
  });
  return token;
}
function authenticate(role) {
  return asyncRoute(async (req, res, next) => {
    const token = tokenFrom(req);
    const session = token
      ? await db.collection("sessions").findOne({
          tokenHash: sessionHash(token),
          role,
          expiresAt: { $gt: new Date() },
        })
      : null;
    if (!session) {
      return fail(
        res,
        401,
        "Your session has expired. Please log in again.",
        "SESSION_EXPIRED",
      );
    }
    if (role === "borrower") {
      const user = await db
        .collection("users")
        .findOne({
          _id: new ObjectId(session.subject),
          active: { $ne: false },
        });
      if (!user) {
        await db.collection("sessions").deleteOne({ tokenHash: sessionHash(token) });
        return fail(
          res,
          401,
          "This borrower account is inactive or has been removed.",
          "ACCOUNT_INACTIVE",
        );
      }
      req.user = user;
    }
    req.sessionToken = token;
    req.session = session;
    next();
  });
}
const borrowerAuth = authenticate("borrower");
const adminAuth = authenticate("admin");

function userView(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    name: user.name || user.username,
    active: user.active !== false,
    createdAt: user.createdAt,
  };
}
function loanView(loan) {
  const result = Object.assign({}, loan, { id: String(loan._id) });
  delete result._id;
  if (
    result.status === "borrowed" &&
    result.dueDate &&
    result.dueDate < today()
  )
    result.displayStatus = "overdue";
  else result.displayStatus = result.status;
  return result;
}
async function bookAvailability() {
  const counts = await db
    .collection("borrowings")
    .aggregate([
      { $match: { status: { $in: ["pending", "borrowed"] } } },
      {
        $group: {
          _id: "$bookId",
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$quantity", 0] },
          },
          borrowed: {
            $sum: { $cond: [{ $eq: ["$status", "borrowed"] }, "$quantity", 0] },
          },
        },
      },
    ])
    .toArray();
  return new Map(counts.map((item) => [item._id, item]));
}
async function booksWithAvailability(filter = {}) {
  const books = await db
    .collection("books")
    .find(filter, { projection: { borrowedCopies: 0 } })
    .sort({ id: 1 })
    .toArray();
  const counts = await bookAvailability();
  return books.map((book) => {
    const count = counts.get(book.id) || { pending: 0, borrowed: 0 };
    return Object.assign({}, book, {
      _id: undefined,
      id: book.id,
      available: book.available !== false,
      availableCount: Math.max(
        0,
        book.quantity - count.pending - count.borrowed,
      ),
      pendingCount: count.pending,
      borrowedCount: count.borrowed,
    });
  });
}
function validateBook(body) {
  const id = clean(body.id).toUpperCase();
  const title = clean(body.title),
    author = clean(body.author),
    category = clean(body.category);
  const quantity = Number(body.quantity);
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(id))
    return "Book ID must use 2–20 letters, numbers, or hyphens.";
  if (!title || title.length > 160)
    return "Enter a title up to 160 characters.";
  if (!author || author.length > 100)
    return "Enter an author up to 100 characters.";
  if (!category || category.length > 60)
    return "Enter a category up to 60 characters.";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
    return "Quantity must be a whole number between 1 and 10,000.";
  return null;
}
function normalizeBook(body) {
  return {
    id: clean(body.id).toUpperCase(),
    title: clean(body.title),
    author: clean(body.author),
    category: clean(body.category),
    quantity: Number(body.quantity),
    available: body.available !== false,
    updatedAt: new Date(),
  };
}
async function openCounts(bookId) {
  const result = await db
    .collection("borrowings")
    .aggregate([
      { $match: { bookId, status: { $in: ["pending", "borrowed"] } } },
      {
        $group: {
          _id: null,
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$quantity", 0] },
          },
          borrowed: {
            $sum: { $cond: [{ $eq: ["$status", "borrowed"] }, "$quantity", 0] },
          },
        },
      },
    ])
    .toArray();
  return result[0] || { pending: 0, borrowed: 0 };
}

app.get("/api/health", (req, res) => res.json({ ok: Boolean(db) }));

// Borrower authentication and profile.
app.post(
  "/api/register",
  asyncRoute(async (req, res) => {
    const username = clean(req.body && req.body.username),
      email = clean(req.body && req.body.email),
      password = req.body && req.body.password;
    if (
      username.length < 4 ||
      username.length > 32 ||
      !/^[A-Za-z0-9_.-]+$/.test(username)
    )
      return fail(
        res,
        400,
        "Username must be 4–32 characters and use letters, numbers, dots, underscores, or hyphens.",
        "USERNAME_INVALID",
      );
    if (!validEmail(email))
      return fail(res, 400, "Enter a valid email address.", "EMAIL_INVALID");
    if (!strongPassword(password))
      return fail(
        res,
        400,
        "Password must be 8+ characters and include uppercase, lowercase, a number, and a special character.",
        "PASSWORD_WEAK",
      );
    try {
      const user = {
        username,
        email,
        name: username,
        passwordHash: await bcrypt.hash(password, 12),
        active: true,
        createdAt: new Date(),
      };
      await db.collection("users").insertOne(user);
      res
        .status(201)
        .json({
          message: "Your borrower account was created. You can log in now.",
        });
    } catch (error) {
      if (error.code === 11000)
        return fail(
          res,
          409,
          "That username is already registered.",
          "USERNAME_EXISTS",
        );
      throw error;
    }
  }),
);

app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    const username = clean(req.body && req.body.username),
      password = req.body && req.body.password;
    if (!username)
      return fail(res, 400, "Enter your username.", "USERNAME_REQUIRED");
    if (typeof password !== "string" || !password)
      return fail(res, 400, "Enter your password.", "PASSWORD_REQUIRED");
    const user = await db
      .collection("users")
      .findOne({
        username: {
          $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      });
    if (!user)
      return fail(
        res,
        401,
        "No borrower account was found with that username.",
        "USERNAME_NOT_FOUND",
      );
    if (!(await bcrypt.compare(password, user.passwordHash)))
      return fail(res, 401, "The password is incorrect.", "PASSWORD_INCORRECT");
    if (user.active === false)
      return fail(
        res,
        403,
        "This borrower account is inactive. Contact the library admin.",
        "ACCOUNT_INACTIVE",
      );
    res.json({
      token: await tokenFor(String(user._id), "borrower"),
      user: userView(user),
    });
  }),
);

app.post(
  "/api/admin/login",
  asyncRoute(async (req, res) => {
    const username = clean(req.body && req.body.username),
      password = req.body && req.body.password;
    if (!username)
      return fail(res, 400, "Enter the admin username.", "USERNAME_REQUIRED");
    if (username !== ADMIN_USERNAME)
      return fail(res, 401, "Admin username not found.", "USERNAME_NOT_FOUND");
    if (typeof password !== "string" || password !== ADMIN_PASSWORD)
      return fail(
        res,
        401,
        "Admin password is incorrect.",
        "PASSWORD_INCORRECT",
      );
    res.json({
      token: await tokenFor(ADMIN_USERNAME, "admin"),
      user: { username: ADMIN_USERNAME, name: "Library Admin", role: "admin" },
    });
  }),
);

app.post(
  "/api/logout",
  asyncRoute(async (req, res) => {
    const token = tokenFrom(req);
    if (token)
      await db.collection("sessions").deleteOne({ tokenHash: sessionHash(token) });
    res.json({ message: "You have been logged out." });
  }),
);

app.get("/api/me", borrowerAuth, (req, res) => res.json(userView(req.user)));
app.patch(
  "/api/me",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    const name = clean(req.body && req.body.name),
      email = clean(req.body && req.body.email);
    if (!name || name.length > 80)
      return fail(
        res,
        400,
        "Enter a display name up to 80 characters.",
        "NAME_INVALID",
      );
    if (!validEmail(email))
      return fail(res, 400, "Enter a valid email address.", "EMAIL_INVALID");
    await db
      .collection("users")
      .updateOne(
        { _id: req.user._id },
        { $set: { name, email, updatedAt: new Date() } },
      );
    res.json({
      message: "Profile updated.",
      user: userView(Object.assign({}, req.user, { name, email })),
    });
  }),
);
app.put(
  "/api/me/password",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    const currentPassword = req.body && req.body.currentPassword,
      newPassword = req.body && req.body.newPassword;
    if (typeof currentPassword !== "string" || !currentPassword)
      return fail(
        res,
        400,
        "Enter your current password.",
        "CURRENT_PASSWORD_REQUIRED",
      );
    if (!(await bcrypt.compare(currentPassword, req.user.passwordHash)))
      return fail(
        res,
        401,
        "Current password is incorrect.",
        "CURRENT_PASSWORD_INCORRECT",
      );
    if (!strongPassword(newPassword))
      return fail(
        res,
        400,
        "New password must be 8+ characters and include uppercase, lowercase, a number, and a special character.",
        "PASSWORD_WEAK",
      );
    await db
      .collection("users")
      .updateOne(
        { _id: req.user._id },
        {
          $set: {
            passwordHash: await bcrypt.hash(newPassword, 12),
            updatedAt: new Date(),
          },
        },
      );
    await db.collection("sessions").deleteMany({
      role: "borrower",
      subject: String(req.user._id),
    });
    res.json({ message: "Password changed. Please log in again." });
  }),
);
app.delete(
  "/api/me",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    const active = await db
      .collection("borrowings")
      .countDocuments({ userId: String(req.user._id), status: "borrowed" });
    if (active)
      return fail(
        res,
        409,
        "Return all borrowed books before deleting your account.",
        "ACTIVE_LOANS",
      );
    await db
      .collection("borrowings")
      .updateMany(
        { userId: String(req.user._id), status: "pending" },
        { $set: { status: "cancelled", updatedAt: new Date() } },
      );
    await db.collection("users").deleteOne({ _id: req.user._id });
    await db.collection("sessions").deleteMany({
      role: "borrower",
      subject: String(req.user._id),
    });
    res.json({ message: "Borrower account deleted." });
  }),
);

// Books and borrower requests.
app.get(
  "/api/books",
  borrowerAuth,
  asyncRoute(async (req, res) => res.json(await booksWithAvailability())),
);
app.get(
  "/api/me/borrowings",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    const items = await db
      .collection("borrowings")
      .find({ userId: String(req.user._id) })
      .sort({ requestedAt: -1 })
      .toArray();
    res.json(items.map(loanView));
  }),
);
app.post(
  "/api/me/borrowings",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    const bookId = clean(req.body && req.body.bookId).toUpperCase(),
      quantity = Number((req.body && req.body.quantity) || 1);
    if (!bookId)
      return fail(res, 400, "Choose a book to request.", "BOOK_REQUIRED");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5)
      return fail(
        res,
        400,
        "Request quantity must be a whole number from 1 to 5.",
        "QUANTITY_INVALID",
      );
    const book = await db.collection("books").findOne({ id: bookId });
    if (!book) return fail(res, 404, "Book not found.", "BOOK_NOT_FOUND");
    if (book.available === false)
      return fail(
        res,
        409,
        "This book is currently unavailable.",
        "BOOK_UNAVAILABLE",
      );
    const duplicate = await db
      .collection("borrowings")
      .findOne({
        userId: String(req.user._id),
        bookId,
        status: { $in: ["pending", "borrowed"] },
      });
    if (duplicate)
      return fail(
        res,
        409,
        "You already have an open request or loan for this book.",
        "DUPLICATE_REQUEST",
      );
    const counts = await openCounts(bookId),
      available = book.quantity - counts.pending - counts.borrowed;
    if (quantity > available)
      return fail(
        res,
        409,
        available > 0
          ? `Only ${available} copies are available to request.`
          : "No copies are currently available.",
        "NO_COPIES",
      );
    const record = {
      userId: String(req.user._id),
      username: req.user.username,
      userName: req.user.name || req.user.username,
      userEmail: req.user.email,
      bookId,
      bookTitle: book.title,
      author: book.author,
      quantity,
      status: "pending",
      requestedAt: new Date(),
      dueDate: null,
      returnDate: null,
    };
    const result = await db.collection("borrowings").insertOne(record);
    res
      .status(201)
      .json({
        message: "Borrow request sent to the library admin.",
        record: loanView(Object.assign({}, record, { _id: result.insertedId })),
      });
  }),
);
app.patch(
  "/api/me/borrowings/:id",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrowing record.", "RECORD_INVALID");
    const record = await db
      .collection("borrowings")
      .findOne({
        _id: new ObjectId(req.params.id),
        userId: String(req.user._id),
        status: "pending",
      });
    if (!record)
      return fail(
        res,
        404,
        "Only a pending request can be edited.",
        "REQUEST_NOT_EDITABLE",
      );
    const quantity = Number(req.body && req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5)
      return fail(
        res,
        400,
        "Request quantity must be a whole number from 1 to 5.",
        "QUANTITY_INVALID",
      );
    const book = await db.collection("books").findOne({ id: record.bookId });
    const counts = await openCounts(record.bookId),
      available =
        (book ? book.quantity : 0) -
        counts.borrowed -
        counts.pending +
        record.quantity;
    if (quantity > available)
      return fail(
        res,
        409,
        `Only ${Math.max(0, available)} copies are available.`,
        "NO_COPIES",
      );
    await db
      .collection("borrowings")
      .updateOne(
        { _id: record._id },
        { $set: { quantity, updatedAt: new Date() } },
      );
    res.json({ message: "Borrow request updated." });
  }),
);
app.delete(
  "/api/me/borrowings/:id",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrowing record.", "RECORD_INVALID");
    const result = await db
      .collection("borrowings")
      .updateOne(
        {
          _id: new ObjectId(req.params.id),
          userId: String(req.user._id),
          status: "pending",
        },
        { $set: { status: "cancelled", updatedAt: new Date() } },
      );
    if (!result.modifiedCount)
      return fail(
        res,
        404,
        "Only a pending request can be cancelled.",
        "REQUEST_NOT_CANCELLABLE",
      );
    res.json({ message: "Borrow request cancelled." });
  }),
);
app.post(
  "/api/me/borrowings/:id/return",
  borrowerAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrowing record.", "RECORD_INVALID");
    const now = new Date();
    const result = await db.collection("borrowings").updateOne(
      {
        _id: new ObjectId(req.params.id),
        userId: String(req.user._id),
        status: "borrowed",
      },
      { $set: { status: "returned", returnDate: now, updatedAt: now } },
    );
    if (!result.modifiedCount)
      return fail(
        res,
        404,
        "This active loan was not found on your account.",
        "LOAN_NOT_ACTIVE",
      );
    res.json({ message: "Book return recorded." });
  }),
);

// Admin dashboard and book management.
app.get(
  "/api/admin/stats",
  adminAuth,
  asyncRoute(async (req, res) => {
    const [books, users, pending, active, overdue, history] = await Promise.all(
      [
        db.collection("books").countDocuments(),
        db.collection("users").countDocuments({ active: { $ne: false } }),
        db.collection("borrowings").countDocuments({ status: "pending" }),
        db.collection("borrowings").countDocuments({ status: "borrowed" }),
        db
          .collection("borrowings")
          .countDocuments({ status: "borrowed", dueDate: { $lt: today() } }),
        db.collection("borrowings").countDocuments(),
      ],
    );
    res.json({ books, users, pending, active, overdue, history });
  }),
);
app.get(
  "/api/admin/books",
  adminAuth,
  asyncRoute(async (req, res) => res.json(await booksWithAvailability())),
);
app.post(
  "/api/admin/books",
  adminAuth,
  asyncRoute(async (req, res) => {
    const message = validateBook(req.body || {});
    if (message) return fail(res, 400, message, "BOOK_INVALID");
    try {
      await db.collection("books").insertOne(normalizeBook(req.body));
      res.status(201).json({ message: "Book added." });
    } catch (error) {
      if (error.code === 11000)
        return fail(
          res,
          409,
          "A book with that ID already exists.",
          "BOOK_EXISTS",
        );
      throw error;
    }
  }),
);
app.put(
  "/api/admin/books/:id",
  adminAuth,
  asyncRoute(async (req, res) => {
    const payload = Object.assign({}, req.body, { id: req.params.id });
    const message = validateBook(payload);
    if (message) return fail(res, 400, message, "BOOK_INVALID");
    const book = await db.collection("books").findOne({ id: req.params.id });
    if (!book) return fail(res, 404, "Book not found.", "BOOK_NOT_FOUND");
    const counts = await openCounts(book.id);
    if (Number(payload.quantity) < counts.pending + counts.borrowed)
      return fail(
        res,
        409,
        "Quantity cannot be lower than copies in pending requests or active loans.",
        "QUANTITY_IN_USE",
      );
    await db
      .collection("books")
      .updateOne({ id: book.id }, { $set: normalizeBook(payload) });
    res.json({ message: "Book updated." });
  }),
);
app.delete(
  "/api/admin/books/:id",
  adminAuth,
  asyncRoute(async (req, res) => {
    const book = await db.collection("books").findOne({ id: req.params.id });
    if (!book) return fail(res, 404, "Book not found.", "BOOK_NOT_FOUND");
    const active = await db
      .collection("borrowings")
      .countDocuments({
        bookId: book.id,
        status: { $in: ["pending", "borrowed"] },
      });
    if (active)
      return fail(
        res,
        409,
        "Cancel pending requests and process active returns before deleting this title.",
        "BOOK_HAS_ACTIVITY",
      );
    await db.collection("books").deleteOne({ id: book.id });
    res.json({ message: "Book deleted." });
  }),
);

// Admin borrower management.
app.get(
  "/api/admin/users",
  adminAuth,
  asyncRoute(async (req, res) => {
    const users = await db
      .collection("users")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(users.map(userView));
  }),
);
app.post(
  "/api/admin/users",
  adminAuth,
  asyncRoute(async (req, res) => {
    const body = req.body || {},
      username = clean(body.username),
      email = clean(body.email),
      name = clean(body.name) || username,
      password = body.password;
    if (
      username.length < 4 ||
      username.length > 32 ||
      !/^[A-Za-z0-9_.-]+$/.test(username)
    )
      return fail(
        res,
        400,
        "Username must be 4–32 characters and use letters, numbers, dots, underscores, or hyphens.",
        "USERNAME_INVALID",
      );
    if (username.toLowerCase() === ADMIN_USERNAME)
      return fail(res, 400, "That username is reserved for the library admin.", "USERNAME_RESERVED");
    if (!validEmail(email))
      return fail(res, 400, "Enter a valid email address.", "EMAIL_INVALID");
    if (!strongPassword(password))
      return fail(
        res,
        400,
        "Password must be 8+ characters with uppercase, lowercase, a number, and a special character.",
        "PASSWORD_WEAK",
      );
    try {
      await db
        .collection("users")
        .insertOne({
          username,
          email,
          name,
          passwordHash: await bcrypt.hash(password, 12),
          active: true,
          createdAt: new Date(),
        });
      res.status(201).json({ message: "Borrower account created." });
    } catch (error) {
      if (error.code === 11000)
        return fail(
          res,
          409,
          "That username is already registered.",
          "USERNAME_EXISTS",
        );
      throw error;
    }
  }),
);
app.put(
  "/api/admin/users/:id",
  adminAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrower ID.", "USER_ID_INVALID");
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return fail(res, 404, "Borrower not found.", "USER_NOT_FOUND");
    const body = req.body || {},
      set = { updatedAt: new Date() };
    if (body.username !== undefined) {
      const username = clean(body.username);
      if (
        username.length < 4 ||
        username.length > 32 ||
        !/^[A-Za-z0-9_.-]+$/.test(username)
      )
        return fail(
          res,
          400,
          "Username must be 4–32 valid characters.",
          "USERNAME_INVALID",
        );
      if (username.toLowerCase() === ADMIN_USERNAME)
        return fail(res, 400, "That username is reserved for the library admin.", "USERNAME_RESERVED");
      set.username = username;
    }
    if (body.name !== undefined) {
      const name = clean(body.name);
      if (!name || name.length > 80)
        return fail(
          res,
          400,
          "Enter a display name up to 80 characters.",
          "NAME_INVALID",
        );
      set.name = name;
    }
    if (body.email !== undefined) {
      const email = clean(body.email);
      if (!validEmail(email))
        return fail(res, 400, "Enter a valid email address.", "EMAIL_INVALID");
      set.email = email;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean")
        return fail(res, 400, "Account status is invalid.", "STATUS_INVALID");
      set.active = body.active;
    }
    if (body.password) {
      if (!strongPassword(body.password))
        return fail(
          res,
          400,
          "Password must be 8+ characters with uppercase, lowercase, a number, and a special character.",
          "PASSWORD_WEAK",
        );
      set.passwordHash = await bcrypt.hash(body.password, 12);
    }
    try {
      await db.collection("users").updateOne({ _id: user._id }, { $set: set });
      res.json({ message: "Borrower account updated." });
    } catch (error) {
      if (error.code === 11000)
        return fail(
          res,
          409,
          "That username is already registered.",
          "USERNAME_EXISTS",
        );
      throw error;
    }
  }),
);
app.delete(
  "/api/admin/users/:id",
  adminAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrower ID.", "USER_ID_INVALID");
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!user) return fail(res, 404, "Borrower not found.", "USER_NOT_FOUND");
    const active = await db
      .collection("borrowings")
      .countDocuments({ userId: String(user._id), status: "borrowed" });
    if (active)
      return fail(
        res,
        409,
        "Process this borrower’s returns before deleting the account.",
        "USER_HAS_LOANS",
      );
    await db
      .collection("borrowings")
      .updateMany(
        { userId: String(user._id), status: "pending" },
        { $set: { status: "cancelled", updatedAt: new Date() } },
      );
    await db.collection("users").deleteOne({ _id: user._id });
    res.json({ message: "Borrower account deleted." });
  }),
);

// Admin borrowing operations and permanent borrowing history.
app.get(
  "/api/admin/borrowings",
  adminAuth,
  asyncRoute(async (req, res) => {
    const items = await db
      .collection("borrowings")
      .find({})
      .sort({ requestedAt: -1 })
      .toArray();
    res.json(items.map(loanView));
  }),
);
app.post(
  "/api/admin/borrowings/:id/approve",
  adminAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrowing record.", "RECORD_INVALID");
    const record = await db
      .collection("borrowings")
      .findOne({ _id: new ObjectId(req.params.id), status: "pending" });
    if (!record)
      return fail(
        res,
        404,
        "This request is no longer pending.",
        "REQUEST_NOT_PENDING",
      );
    const book = await db.collection("books").findOne({ id: record.bookId });
    if (!book || book.available === false)
      return fail(res, 409, "This title is unavailable.", "BOOK_UNAVAILABLE");
    const counts = await openCounts(record.bookId);
    if (counts.pending + counts.borrowed > book.quantity)
      return fail(
        res,
        409,
        "There are not enough copies to approve this request.",
        "NO_COPIES",
      );
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const update = await db
      .collection("borrowings")
      .updateOne(
        { _id: record._id, status: "pending" },
        {
          $set: {
            status: "borrowed",
            approvedAt: new Date(),
            borrowedAt: new Date(),
            dueDate: due.toISOString().slice(0, 10),
            updatedAt: new Date(),
          },
        },
      );
    if (!update.modifiedCount)
      return fail(
        res,
        409,
        "Request status changed. Refresh and try again.",
        "REQUEST_CHANGED",
      );
    res.json({
      message: "Borrow request approved. The due date is in 7 days.",
    });
  }),
);
app.post(
  "/api/admin/borrowings/:id/reject",
  adminAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrowing record.", "RECORD_INVALID");
    const result = await db
      .collection("borrowings")
      .updateOne(
        { _id: new ObjectId(req.params.id), status: "pending" },
        {
          $set: {
            status: "rejected",
            rejectedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );
    if (!result.modifiedCount)
      return fail(
        res,
        404,
        "This request is no longer pending.",
        "REQUEST_NOT_PENDING",
      );
    res.json({ message: "Borrow request rejected." });
  }),
);
app.post(
  "/api/admin/borrowings/:id/return",
  adminAuth,
  asyncRoute(async (req, res) => {
    if (!ObjectId.isValid(req.params.id))
      return fail(res, 400, "Invalid borrowing record.", "RECORD_INVALID");
    const result = await db
      .collection("borrowings")
      .updateOne(
        { _id: new ObjectId(req.params.id), status: "borrowed" },
        {
          $set: {
            status: "returned",
            returnDate: new Date(),
            updatedAt: new Date(),
          },
        },
      );
    if (!result.modifiedCount)
      return fail(
        res,
        404,
        "This active loan was not found.",
        "LOAN_NOT_ACTIVE",
      );
    res.json({ message: "Book return processed." });
  }),
);

app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.name === "SyntaxError")
    return fail(
      res,
      400,
      "Request body must contain valid JSON.",
      "JSON_INVALID",
    );
  res
    .status(500)
    .json({
      message: "The server could not complete the request. Please try again.",
      code: "SERVER_ERROR",
    });
});

async function migrateLegacyLoans() {
  const books = await db
    .collection("books")
    .find({ borrowedCopies: { $exists: true, $ne: [] } })
    .toArray();
  for (const book of books) {
    for (let index = 0; index < book.borrowedCopies.length; index++) {
      const copy = book.borrowedCopies[index];
      if (!copy.username) continue;
      const legacyKey = `${book.id}:${copy.username}:${copy.dueDate || "no-date"}:${index}`;
      await db
        .collection("borrowings")
        .updateOne(
          { legacyKey },
          {
            $setOnInsert: {
              legacyKey,
              bookId: book.id,
              bookTitle: book.title,
              author: book.author,
              username: copy.username,
              userName: copy.username,
              userEmail: "",
              quantity: 1,
              status: "borrowed",
              requestedAt: new Date(),
              borrowedAt: new Date(),
              dueDate: copy.dueDate || null,
              returnDate: null,
            },
          },
          { upsert: true },
        );
    }
    await db
      .collection("books")
      .updateOne({ _id: book._id }, { $set: { borrowedCopies: [] } });
  }
}

async function start() {
  if (!process.env.MONGODB_URI)
    throw new Error("Set MONGODB_URI in your .env file.");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || "reading_room");
  await Promise.all([
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("books").createIndex({ id: 1 }, { unique: true }),
    db
      .collection("borrowings")
      .createIndex({ legacyKey: 1 }, { unique: true, sparse: true }),
    db.collection("borrowings").createIndex({ userId: 1, status: 1 }),
    db.collection("borrowings").createIndex({ bookId: 1, status: 1 }),
    db.collection("borrowings").createIndex({ status: 1, dueDate: 1 }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
  ]);
  if ((await db.collection("books").estimatedDocumentCount()) === 0)
    await db.collection("books").insertMany(seedBooks);
  await migrateLegacyLoans();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () =>
    console.log(`Reading Room running at http://localhost:${port}`),
  );
}
start().catch((error) => {
  console.error("Could not start Reading Room:", error.message);
  process.exit(1);
});
