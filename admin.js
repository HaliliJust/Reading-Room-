let adminBooks=[];
let adminUsers=[];
let adminLoans=[];
let loanFilter='action';
let editingBookId=null;
let editingUserId=null;
const adminTitles={dashboard:'Dashboard',books:'Book management',borrowing:'Borrowing management',users:'User management',history:'Borrowing history'};

function showAdminView(name){
  document.querySelectorAll('.admin-view').forEach(section=>section.classList.toggle('active',section.id==='adminView'+name[0].toUpperCase()+name.slice(1)));
  document.querySelectorAll('[data-admin-view]').forEach(item=>item.classList.toggle('active',item.dataset.adminView===name));
  document.getElementById('adminPageTitle').textContent=adminTitles[name]||'Dashboard';
  history.replaceState(null,'','#'+name);
}
function errorText(id,message){const node=document.getElementById(id);if(node){node.textContent=message||'';node.classList.toggle('show',Boolean(message));}}
function clearFormErrors(form){form.querySelectorAll('.field-error').forEach(node=>{node.textContent='';node.classList.remove('show');});}
function tableEmpty(message){return `<div class="empty-state">${escapeHtml(message)}</div>`;}
function pill(status){const normalized=status==='overdue'?'overdue':status==='borrowed'?'borrowed':status==='pending'?'pending':status==='returned'?'returned':status==='active'?'available':status==='rejected'||status==='cancelled'?'muted':'muted';return `<span class="status-pill ${normalized}">${escapeHtml(statusLabel(status))}</span>`;}
async function loadAdminData(){
  const [stats,books,users,loans]=await Promise.all([apiRequest('/admin/stats'),apiRequest('/admin/books'),apiRequest('/admin/users'),apiRequest('/admin/borrowings')]);
  adminBooks=books;adminUsers=users;adminLoans=loans;renderStats(stats);renderBooks();renderUsers();renderBorrowings();renderHistory();renderOverview();
}
function renderStats(stats){
  document.getElementById('adminStatBooks').textContent=stats.books;document.getElementById('adminStatUsers').textContent=stats.users;document.getElementById('adminStatPending').textContent=stats.pending;document.getElementById('adminStatOverdue').textContent=stats.overdue;document.getElementById('pendingNavCount').textContent=stats.pending;
}
function renderOverview(){
  const recent=adminLoans.slice(0,6),target=document.getElementById('dashboardRecent');
  target.innerHTML=recent.length?`<table><thead><tr><th>Borrower</th><th>Book</th><th>Requested</th><th>Status</th></tr></thead><tbody>${recent.map(loan=>`<tr><td>${escapeHtml(loan.userName||loan.username)}</td><td>${escapeHtml(loan.bookTitle)}</td><td>${formatDate(loan.requestedAt)}</td><td>${pill(loan.displayStatus)}</td></tr>`).join('')}</tbody></table>`:tableEmpty('No borrowing activity yet.');
  const limited=adminBooks.filter(book=>book.availableCount<3||book.available===false).slice(0,6),bookTarget=document.getElementById('dashboardBooks');
  bookTarget.innerHTML=limited.length?`<table><thead><tr><th>Title</th><th>Book ID</th><th>Available</th><th>Status</th></tr></thead><tbody>${limited.map(book=>`<tr><td>${escapeHtml(book.title)}</td><td>${escapeHtml(book.id)}</td><td>${book.availableCount} / ${book.quantity}</td><td>${pill(book.available?'active':'unavailable')}</td></tr>`).join('')}</tbody></table>`:tableEmpty('All titles currently have healthy availability.');
}
function renderBooks(){
  const query=(document.getElementById('adminBookSearch')?.value||'').toLowerCase().trim();
  const items=adminBooks.filter(book=>[book.id,book.title,book.author,book.category].some(value=>String(value).toLowerCase().includes(query)));
  document.getElementById('adminBookCount').textContent=`${items.length} title${items.length===1?'':'s'}`;
  document.getElementById('adminBooksTable').innerHTML=items.length?`<table><thead><tr><th>Book</th><th>Author / Category</th><th>Copies</th><th>Availability</th><th>Actions</th></tr></thead><tbody>${items.map(book=>`<tr><td><strong>${escapeHtml(book.title)}</strong><small class="table-sub">${escapeHtml(book.id)}</small></td><td>${escapeHtml(book.author)}<small class="table-sub">${escapeHtml(book.category)}</small></td><td>${book.availableCount} available <small class="table-sub">${book.pendingCount} pending · ${book.borrowedCount} on loan · ${book.quantity} total</small></td><td>${pill(book.available?'active':'unavailable')}</td><td class="table-actions"><button class="table-button" data-book-edit="${escapeHtml(book.id)}">Edit</button><button class="table-button" data-book-toggle="${escapeHtml(book.id)}">${book.available?'Set unavailable':'Set available'}</button><button class="table-button danger-text" data-book-delete="${escapeHtml(book.id)}">Delete</button></td></tr>`).join('')}</tbody></table>`:tableEmpty('No books match this search.');
}
function renderUsers(){
  const query=(document.getElementById('adminUserSearch')?.value||'').toLowerCase().trim();
  const items=adminUsers.filter(user=>[user.username,user.name,user.email].some(value=>String(value).toLowerCase().includes(query)));
  document.getElementById('adminUserCount').textContent=`${items.length} borrower${items.length===1?'':'s'}`;
  document.getElementById('adminUsersTable').innerHTML=items.length?`<table><thead><tr><th>Borrower</th><th>Email</th><th>Joined</th><th>Account</th><th>Actions</th></tr></thead><tbody>${items.map(user=>`<tr><td><strong>${escapeHtml(user.name)}</strong><small class="table-sub">@${escapeHtml(user.username)}</small></td><td>${escapeHtml(user.email)}</td><td>${formatDate(user.createdAt)}</td><td>${pill(user.active?'active':'inactive')}</td><td class="table-actions"><button class="table-button" data-user-edit="${escapeHtml(user.id)}">Edit</button><button class="table-button" data-user-toggle="${escapeHtml(user.id)}">${user.active?'Suspend':'Activate'}</button><button class="table-button danger-text" data-user-delete="${escapeHtml(user.id)}">Delete</button></td></tr>`).join('')}</tbody></table>`:tableEmpty('No borrower accounts match this search.');
}
function renderBorrowings(){
  const target=document.getElementById('adminBorrowingTable');let items=adminLoans.filter(loan=>['pending','borrowed'].includes(loan.status));
  if(loanFilter==='action')items=items.filter(loan=>loan.status==='pending'||loan.displayStatus==='overdue');
  if(loanFilter==='overdue')items=items.filter(loan=>loan.displayStatus==='overdue');
  target.innerHTML=items.length?`<table><thead><tr><th>Borrower</th><th>Book</th><th>Qty</th><th>Requested / Due</th><th>Status</th><th>Process</th></tr></thead><tbody>${items.map(loan=>`<tr><td><strong>${escapeHtml(loan.userName||loan.username)}</strong><small class="table-sub">${escapeHtml(loan.userEmail||'')}</small></td><td><strong>${escapeHtml(loan.bookTitle)}</strong><small class="table-sub">${escapeHtml(loan.bookId)}</small></td><td>${loan.quantity}</td><td>${loan.status==='pending'?formatDate(loan.requestedAt):`Due ${formatDate(loan.dueDate)}`}</td><td>${pill(loan.displayStatus)}</td><td class="table-actions">${loan.status==='pending'?`<button class="table-button approve-button" data-loan-approve="${escapeHtml(loan.id)}">Approve</button><button class="table-button danger-text" data-loan-reject="${escapeHtml(loan.id)}">Reject</button>`:`<button class="table-button approve-button" data-loan-return="${escapeHtml(loan.id)}">Process return</button>`}</td></tr>`).join('')}</tbody></table>`:tableEmpty(loanFilter==='overdue'?'No overdue books.':'No borrowing requests need action.');
}
function renderHistory(){
  const query=(document.getElementById('historySearch')?.value||'').toLowerCase().trim();
  const items=adminLoans.filter(loan=>[loan.userName,loan.username,loan.userEmail,loan.bookTitle,loan.bookId,loan.displayStatus].some(value=>String(value||'').toLowerCase().includes(query)));
  document.getElementById('historyCount').textContent=`${items.length} record${items.length===1?'':'s'}`;
  document.getElementById('adminHistoryTable').innerHTML=items.length?`<table><thead><tr><th>Borrower</th><th>Book</th><th>Qty</th><th>Requested</th><th>Due / Returned</th><th>Status</th></tr></thead><tbody>${items.map(loan=>`<tr><td><strong>${escapeHtml(loan.userName||loan.username)}</strong><small class="table-sub">${escapeHtml(loan.userEmail||'')}</small></td><td>${escapeHtml(loan.bookTitle)}<small class="table-sub">${escapeHtml(loan.bookId)}</small></td><td>${loan.quantity}</td><td>${formatDate(loan.requestedAt)}</td><td>${formatDate(loan.returnDate||loan.dueDate)}</td><td>${pill(loan.displayStatus)}</td></tr>`).join('')}</tbody></table>`:tableEmpty('No borrowing records found.');
}
function openBookForm(book){
  editingBookId=book?book.id:null;const form=document.getElementById('bookForm');form.reset();clearFormErrors(form);
  document.getElementById('bookModalTitle').textContent=book?'Edit book':'Add a book';document.getElementById('bookOriginalId').value=book?book.id:'';
  document.getElementById('bookId').value=book?book.id:'';document.getElementById('bookId').disabled=Boolean(book);document.getElementById('bookTitle').value=book?book.title:'';document.getElementById('bookAuthor').value=book?book.author:'';document.getElementById('bookCategory').value=book?book.category:'';document.getElementById('bookQuantity').value=book?book.quantity:1;document.getElementById('bookAvailable').checked=book?book.available!==false:true;openModal('bookModal');
}
function openUserForm(user){
  editingUserId=user?user.id:null;const form=document.getElementById('userForm');form.reset();clearFormErrors(form);
  document.getElementById('userModalTitle').textContent=user?'Edit borrower':'Add borrower';document.getElementById('userOriginalId').value=user?user.id:'';document.getElementById('userName').value=user?user.name:'';document.getElementById('userUsername').value=user?user.username:'';document.getElementById('userEmail').value=user?user.email:'';document.getElementById('userPassword').value='';document.getElementById('userPassword').required=!user;document.getElementById('userPasswordHint').textContent=user?'(leave blank to keep current)':'(required)';document.getElementById('userUsername').disabled=Boolean(user);document.getElementById('userActiveWrap').hidden=!user;document.getElementById('userActive').checked=user?user.active:true;openModal('userModal');
}
async function performLoanAction(id,action){
  const loan=adminLoans.find(item=>item.id===id);if(!loan)return;
  const config={approve:['Approve request?','This will confirm the loan and set a due date 7 days from today.','Approve'],reject:['Reject request?','The borrower’s request will be recorded as rejected.','Reject'],return:['Process this return?','This will close the active loan and update available copies.','Process return']}[action];
  if(!await confirmAction(config[0],`${config[1]} ${loan.bookTitle} — ${loan.userName||loan.username}.`,config[2]))return;
  try{await apiRequest(`/admin/borrowings/${encodeURIComponent(id)}/${action}`,{method:'POST'});showToast(action==='approve'?'Borrow request approved.':action==='reject'?'Borrow request rejected.':'Book return processed.','success');await loadAdminData();}
  catch(error){showToast(error.message,'error');}
}
function bindAdmin(){
  document.querySelectorAll('[data-admin-view]').forEach(button=>button.addEventListener('click',()=>showAdminView(button.dataset.adminView)));
  const hash=location.hash.slice(1);showAdminView(adminTitles[hash]?hash:'dashboard');
  document.getElementById('adminToday').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  document.getElementById('addBookBtn').addEventListener('click',()=>openBookForm(null));document.getElementById('addUserBtn').addEventListener('click',()=>openUserForm(null));
  document.getElementById('adminBookSearch').addEventListener('input',renderBooks);document.getElementById('adminUserSearch').addEventListener('input',renderUsers);document.getElementById('historySearch').addEventListener('input',renderHistory);
  document.getElementById('refreshBorrowing').addEventListener('click',()=>loadAdminData().then(()=>showToast('Borrowing records refreshed.','success')).catch(error=>showToast(error.message,'error')));
  document.getElementById('refreshHistory').addEventListener('click',()=>loadAdminData().then(()=>showToast('Borrowing history refreshed.','success')).catch(error=>showToast(error.message,'error')));
  document.querySelectorAll('[data-loan-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-loan-filter]').forEach(item=>item.classList.remove('active'));button.classList.add('active');loanFilter=button.dataset.loanFilter;renderBorrowings();}));
  document.body.addEventListener('click',async event=>{
    const link=event.target.closest('[data-admin-view]');if(link&&link.tagName==='BUTTON')return;
    const bookEdit=event.target.closest('[data-book-edit]');if(bookEdit)return openBookForm(adminBooks.find(book=>book.id===bookEdit.dataset.bookEdit));
    const bookToggle=event.target.closest('[data-book-toggle]');if(bookToggle){const book=adminBooks.find(item=>item.id===bookToggle.dataset.bookToggle);if(!book)return;try{await apiRequest('/admin/books/'+encodeURIComponent(book.id),{method:'PUT',body:JSON.stringify(Object.assign({},book,{available:!book.available}))});showToast(book.available?'Book marked unavailable.':'Book marked available.','success');await loadAdminData();}catch(error){showToast(error.message,'error');}return;}
    const bookDelete=event.target.closest('[data-book-delete]');if(bookDelete){const book=adminBooks.find(item=>item.id===bookDelete.dataset.bookDelete);if(!book||!await confirmAction('Delete this book?','“'+book.title+'” will be removed from the catalog. Existing history will remain.','Delete book'))return;try{await apiRequest('/admin/books/'+encodeURIComponent(book.id),{method:'DELETE'});showToast('Book deleted.','success');await loadAdminData();}catch(error){showToast(error.message,'error');}return;}
    const userEdit=event.target.closest('[data-user-edit]');if(userEdit)return openUserForm(adminUsers.find(user=>user.id===userEdit.dataset.userEdit));
    const userToggle=event.target.closest('[data-user-toggle]');if(userToggle){const user=adminUsers.find(item=>item.id===userToggle.dataset.userToggle);if(!user)return;const verb=user.active?'Suspend':'Activate';if(!await confirmAction(verb+' borrower account?',user.active?'This borrower will not be able to log in until the account is reactivated.':'This borrower will be able to log in again.',verb))return;try{await apiRequest('/admin/users/'+encodeURIComponent(user.id),{method:'PUT',body:JSON.stringify({active:!user.active})});showToast('Borrower account '+(user.active?'suspended.':'activated.'),'success');await loadAdminData();}catch(error){showToast(error.message,'error');}return;}
    const userDelete=event.target.closest('[data-user-delete]');if(userDelete){const user=adminUsers.find(item=>item.id===userDelete.dataset.userDelete);if(!user||!await confirmAction('Delete borrower account?','The account will be removed. Completed borrowing history will be retained.','Delete account'))return;try{await apiRequest('/admin/users/'+encodeURIComponent(user.id),{method:'DELETE'});showToast('Borrower account deleted.','success');await loadAdminData();}catch(error){showToast(error.message,'error');}return;}
    const approve=event.target.closest('[data-loan-approve]');if(approve)return performLoanAction(approve.dataset.loanApprove,'approve');
    const reject=event.target.closest('[data-loan-reject]');if(reject)return performLoanAction(reject.dataset.loanReject,'reject');
    const processReturn=event.target.closest('[data-loan-return]');if(processReturn)return performLoanAction(processReturn.dataset.loanReturn,'return');
  });
  document.getElementById('bookForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;clearFormErrors(form);const body={id:document.getElementById('bookId').value.trim(),title:document.getElementById('bookTitle').value.trim(),author:document.getElementById('bookAuthor').value.trim(),category:document.getElementById('bookCategory').value.trim(),quantity:Number(document.getElementById('bookQuantity').value),available:document.getElementById('bookAvailable').checked};let invalid=false;
    if(!/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(body.id)){errorText('bookIdError','Use 2–20 letters, numbers, or hyphens.');invalid=true;}if(!body.title){errorText('bookTitleError','Enter a book title.');invalid=true;}if(!body.author){errorText('bookAuthorError','Enter an author.');invalid=true;}if(!body.category){errorText('bookCategoryError','Enter a category.');invalid=true;}if(!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>10000){errorText('bookQuantityError','Enter a whole number from 1 to 10,000.');invalid=true;}if(invalid)return;
    try{if(editingBookId)await apiRequest('/admin/books/'+encodeURIComponent(editingBookId),{method:'PUT',body:JSON.stringify(body)});else await apiRequest('/admin/books',{method:'POST',body:JSON.stringify(body)});closeModal('bookModal');showToast(editingBookId?'Book updated.':'Book added.','success');await loadAdminData();}catch(error){errorText(error.code==='BOOK_EXISTS'?'bookIdError':'bookTitleError',error.message);showToast(error.message,'error');}
  });
  document.getElementById('userForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;clearFormErrors(form);const body={name:document.getElementById('userName').value.trim(),username:document.getElementById('userUsername').value.trim(),email:document.getElementById('userEmail').value.trim(),password:document.getElementById('userPassword').value,active:document.getElementById('userActive').checked};let invalid=false;
    if(!body.name){errorText('userNameError','Enter a display name.');invalid=true;}if(!editingUserId&&(body.username.length<4||!/^[A-Za-z0-9_.-]+$/.test(body.username))){errorText('userUsernameError','Use at least 4 valid username characters.');invalid=true;}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)){errorText('userEmailError','Enter a valid email address.');invalid=true;}if(!editingUserId&&!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(body.password)){errorText('userPasswordError','Use 8+ characters with upper/lowercase, number, and special character.');invalid=true;}if(editingUserId&&body.password&&!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(body.password)){errorText('userPasswordError','Use 8+ characters with upper/lowercase, number, and special character.');invalid=true;}if(invalid)return;
    if(!body.password)delete body.password;
    try{if(editingUserId)await apiRequest('/admin/users/'+encodeURIComponent(editingUserId),{method:'PUT',body:JSON.stringify(body)});else await apiRequest('/admin/users',{method:'POST',body:JSON.stringify(body)});closeModal('userModal');showToast(editingUserId?'Borrower updated.':'Borrower created.','success');await loadAdminData();}catch(error){const id=error.code==='EMAIL_INVALID'?'userEmailError':error.code==='PASSWORD_WEAK'?'userPasswordError':'userUsernameError';errorText(id,error.message);showToast(error.message,'error');}
  });
  document.getElementById('adminLogout').addEventListener('click',async()=>{if(!await confirmAction('Log out of admin?','You will need to sign in again to manage the library.','Log out'))return;try{await apiRequest('/logout',{method:'POST',token:localStorage.getItem('readingRoomAdminToken')});}catch(_){}localStorage.removeItem('readingRoomAdminToken');showToast('Admin logged out.','success');setTimeout(()=>location.replace('index.html'),300);});
  document.querySelectorAll('.modal-overlay').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)modal.classList.remove('show');}));
}
document.addEventListener('DOMContentLoaded',async()=>{
  if(!localStorage.getItem('readingRoomAdminToken')){location.replace('index.html');return;}
  bindAdmin();
  try{await loadAdminData();}catch(error){localStorage.removeItem('readingRoomAdminToken');showToast(error.message,'error');setTimeout(()=>location.replace('index.html'),900);}
});
