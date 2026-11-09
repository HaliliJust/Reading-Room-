# The Reading Room

The Reading Room is a small library borrowing app. The browser talks to an Express API; user accounts, book inventory, and borrowing records are stored in MongoDB. Passwords are hashed before storage.

## Connect a MongoDB Atlas cluster

1. In MongoDB Atlas, create a free shared cluster (or choose an existing cluster).
2. Under **Database Access**, create a database user and save its password.
3. Under **Network Access**, allow the IP address of the computer running this app.
4. Select **Connect → Drivers** and copy the Node.js connection string.
5. Copy `.env.example` to `.env`, then replace the URI placeholders. Keep `.env` private; it is excluded from Git.

The app creates the `reading_room` database indexes and seeds the 15 catalog titles the first time it connects to an empty database. It stores borrower accounts in `users`, catalog entries in `books`, and each borrow request, approval, return, and cancellation in `borrowings`.

## Run locally

Install Node.js, then in this folder run:

```sh
npm install
npm start
```

Open <http://localhost:3000>. Do not open the HTML files directly; the API must run through the server. Data is shared by everyone connecting to the same app and Atlas cluster.

## Accounts

- Borrowers register from the home page. The admin can also create and manage borrower accounts in the admin dashboard.
- Open **Admin login** on the home page to enter the admin dashboard. The requested fixed demo credentials are username `admin` and password `admin123`.
- Admin access is fixed in `server.js` for this local project. Change those credentials before exposing the app to other users or deploying it.

## Notes

Login sessions are stored in the MongoDB `sessions` collection and expire after seven days. They survive browser refreshes and server restarts. Use HTTPS before deploying this demo for public use.
