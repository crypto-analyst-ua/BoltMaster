// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCxAEDkZ57_yu1RDZ6xAEl7KkBgVli00b0",
  authDomain: "boltmaster-2025.firebaseapp.com",
  projectId: "boltmaster-2025",
  storageBucket: "boltmaster-2025.firebasestorage.app",
  messagingSenderId: "995027194761",
  appId: "1:995027194761:web:d3464fefcc6eb41129c758"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

const ADMIN_PASSWORD = "12345";

let products = [];
let cart = {};
let favorites = {};
let compare = {};
let recentlyViewed = [];
let reviews = {};
let orders = [];
let adminMode = false;
let showingFavorites = false;
let currentView = 'grid';
let currentUser = null;
let currentFilters = {
  category: '',
  minPrice: null,
  maxPrice: null,
  sort: 'default',
  search: '',
  rating: '',
  inStock: true
};

// Инициализация
function init() {
  // Проверяем статус аутентификации
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // Пользователь вошел в систему
      currentUser = user;
      await loadUserData();
      updateLoginUI();
      
      // Загружаем изображения
      loadImages();
    } else {
      // Анонимная аутентификация
      auth.signInAnonymously().catch(error => {
        console.error('Anonymous auth failed:', error);
        showNotification('Ошибка аутентификации', 'error');
      });
    }
  });
  
  loadProducts();
  loadRecentlyViewed();
  setupEventListeners();
  
  document.getElementById("year").innerText = new Date().getFullYear();
}

// Загрузка данных пользователя
async function loadUserData() {
  if (!currentUser) return;
  
  try {
    // Загрузка корзины
    const cartDoc = await db.collection('carts').doc(currentUser.uid).get();
    if (cartDoc.exists) {
      cart = cartDoc.data().items || {};
    }
    updateCartCount();
    
    // Загрузка избранного
    const favDoc = await db.collection('favorites').doc(currentUser.uid).get();
    if (favDoc.exists) {
      favorites = favDoc.data().items || {};
    }
    
    // Загрузка сравнения
    const compDoc = await db.collection('comparisons').doc(currentUser.uid).get();
    if (compDoc.exists) {
      compare = compDoc.data().items || {};
    }
    updateCompareCount();
    renderCompareItems();
    
    // Загрузка недавно просмотренных
    const recentDoc = await db.collection('recentlyViewed').doc(currentUser.uid).get();
    if (recentDoc.exists) {
      recentlyViewed = recentDoc.data().items || [];
    }
    renderRecentlyViewed();
  } catch (error) {
    console.error("Ошибка загрузки данных пользователя:", error);
    showNotification("Ошибка загрузки данных", "error");
  }
}

// Сохранение данных пользователя
async function saveUserData() {
  if (!currentUser) return;
  
  try {
    // Сохранение корзины
    await db.collection('carts').doc(currentUser.uid).set({
      items: cart,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Сохранение избранного
    await db.collection('favorites').doc(currentUser.uid).set({
      items: favorites,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Сохранение сравнения
    await db.collection('comparisons').doc(currentUser.uid).set({
      items: compare,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Сохранение недавно просмотренных
    await db.collection('recentlyViewed').doc(currentUser.uid).set({
      items: recentlyViewed,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Ошибка сохранения данных пользователя:", error);
    showNotification("Ошибка сохранения данных", "error");
  }
}

// Загрузка продуктов из Firestore
async function loadProducts() {
  try {
    const snapshot = await db.collection('products').get();
    if (snapshot.empty) {
      // Если нет продуктов в Firestore
      document.getElementById("product-grid").innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #95a5a6;">
          <i class="fas fa-box-open" style="font-size: 48px; margin-bottom: 15px;"></i>
          <h3>Каталог пуст</h3>
          <p>Используйте админ-панель для импорта товаров</p>
        </div>
      `;
      return;
    }
    
    products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });
    updateCartCount();
    renderProducts();
  } catch (error) {
    console.error("Ошибка загрузки продуктов:", error);
    showNotification("Ошибка загрузки товаров", "error");
  }
}

// Сохранение продуктов в Firestore
async function saveProducts() {
  try {
    const batch = db.batch();
    const productsRef = db.collection('products');
    
    // Удаляем старые продукты
    const snapshot = await productsRef.get();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Добавляем новые продукты
    products.forEach(product => {
      const { id, ...productData } = product;
      const ref = productsRef.doc(id);
      batch.set(ref, productData);
    });
    
    await batch.commit();
    showNotification("Продукты сохранены в Firebase");
  } catch (error) {
    console.error("Ошибка сохранения продуктов:", error);
    showNotification("Ошибка сохранения товаров", "error");
  }
}

// Загрузка недавно просмотренных товаров
async function loadRecentlyViewed() {
  if (!currentUser) return;
  
  try {
    const doc = await db.collection('recentlyViewed').doc(currentUser.uid).get();
    if (doc.exists) {
      recentlyViewed = doc.data().items || [];
      renderRecentlyViewed();
    }
  } catch (error) {
    console.error("Ошибка загрузки недавно просмотренных:", error);
  }
}

// Сохранение недавно просмотренных товаров
async function saveRecentlyViewed() {
  if (!currentUser) return;
  
  try {
    await db.collection('recentlyViewed').doc(currentUser.uid).set({
      items: recentlyViewed,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Ошибка сохранения недавно просмотренных:", error);
  }
}

// Добавление товара в недавно просмотренные
async function addToRecentlyViewed(productId) {
  recentlyViewed = recentlyViewed.filter(id => id !== productId);
  recentlyViewed.unshift(productId);
  
  if (recentlyViewed.length > 5) {
    recentlyViewed = recentlyViewed.slice(0, 5);
  }
  
  await saveRecentlyViewed();
  renderRecentlyViewed();
}

// Загрузка отзывов из Firestore
async function loadReviews() {
  try {
    const snapshot = await db.collection('reviews').get();
    reviews = {};
    snapshot.forEach(doc => {
      reviews[doc.id] = doc.data().reviews || [];
    });
  } catch (error) {
    console.error("Ошибка загрузки отзывов:", error);
  }
}

// Сохранение отзывов в Firestore
async function saveReviews() {
  try {
    const batch = db.batch();
    const reviewsRef = db.collection('reviews');
    
    for (const productId in reviews) {
      const ref = reviewsRef.doc(productId);
      batch.set(ref, { reviews: reviews[productId] });
    }
    
    await batch.commit();
  } catch (error) {
    console.error("Ошибка сохранения отзывов:", error);
  }
}

// Добавление отзыва
async function addReview(productId, reviewData) {
  if (!reviews[productId]) {
    reviews[productId] = [];
  }
  
  const review = {
    id: Date.now().toString(),
    date: new Date().toLocaleDateString('ru-RU'),
    ...reviewData
  };
  
  reviews[productId].push(review);
  
  await saveReviews();
  showNotification('Отзыв добавлен');
  return review;
}

// Получение рейтинга товара
function getProductRating(productId) {
  if (!reviews[productId] || reviews[productId].length === 0) {
    return 0;
  }
  
  const sum = reviews[productId].reduce((total, review) => total + review.rating, 0);
  return sum / reviews[productId].length;
}

// Загрузка сравнения товаров
async function loadCompare() {
  if (!currentUser) return;
  
  try {
    const doc = await db.collection('comparisons').doc(currentUser.uid).get();
    if (doc.exists) {
      compare = doc.data().items || {};
      updateCompareCount();
      renderCompareItems();
    }
  } catch (error) {
    console.error("Ошибка загрузки сравнения:", error);
  }
}

// Сохранение сравнения товаов
async function saveCompare() {
  if (!currentUser) return;
  
  try {
    await db.collection('comparisons').doc(currentUser.uid).set({
      items: compare,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Ошибка сохранения сравнения:", error);
  }
}

// Обновление счетчика сравнения
function updateCompareCount() {
  const count = Object.keys(compare).length;
  document.getElementById("compare-count").innerText = count;
  
  if (count > 0) {
    document.getElementById("compare-container").classList.add('active');
  } else {
    document.getElementById("compare-container").classList.remove('active');
  }
}

// Добавление/удаление товара для сравнения
async function toggleCompare(productId) {
  if (compare[productId]) {
    delete compare[productId];
    showNotification('Товар удален из сравнения');
  } else {
    if (Object.keys(compare).length >= 4) {
      showNotification('Можно сравнивать не более 4 товаров', 'error');
      return;
    }
    
    compare[productId] = true;
    showNotification('Товар добавлен в сравнение');
  }
  
  await saveCompare();
  updateCompareCount();
  renderCompareItems();
  renderProducts();
}

// Отображение товаров для сравнения
function renderCompareItems() {
  const container = document.getElementById("compare-items");
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.keys(compare).forEach(id => {
    const product = products.find(p => p.id === id);
    if (product) {
      const item = document.createElement('div');
      item.className = 'compare-item';
      item.innerHTML = `
        <img src="${product.image || 'https://picsum.photos/30/30'}" alt="${product.title}" onerror="this.src='https://picsum.photos/30/30'">
        <span>${product.title}</span>
        <button class="compare-item-remove" onclick="toggleCompare('${product.id}')">
          <i class="fas fa-times"></i>
        </button>
      `;
      container.appendChild(item);
    }
  });
}

// Загрузка заказов из Firestore
async function loadOrders() {
  try {
    let query = db.collection('orders');
    
    // Если не админ, загружаем только свои заказы
    if (!adminMode && currentUser) {
      query = query.where('userId', '==', currentUser.uid);
    }
    
    const snapshot = await query.orderBy('date', 'desc').get();
    orders = [];
    snapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
  } catch (error) {
    console.error("Ошибка загрузки заказов:", error);
  }
}

// Сохранение заказов в Firestore
async function saveOrders() {
  try {
    const batch = db.batch();
    const ordersRef = db.collection('orders');
    
    for (const order of orders) {
      const { id, ...orderData } = order;
      const ref = id ? ordersRef.doc(id) : ordersRef.doc();
      batch.set(ref, orderData);
    }
    
    await batch.commit();
  } catch (error) {
    console.error("Ошибка сохранения заказов:", error);
  }
}

// Добавление товара в корзину
async function addToCart(id, quantity = 1) {
  cart[id] = (cart[id] || 0) + quantity;
  updateCartCount();
  await saveUserData();
  showNotification("Товар добавлен в корзину");
}

// Обновление количества товара в корзине
async function updateCartItem(id, quantity) {
  if (quantity <= 0) {
    delete cart[id];
  } else {
    cart[id] = quantity;
  }
  
  updateCartCount();
  await saveUserData();
  
  if (document.getElementById("modal").classList.contains('active')) {
    openCart();
  }
}

// Обновление счетчика корзины
function updateCartCount() {
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  document.getElementById("cart-count").innerText = count;
}

// Оформление заказа
async function checkout() {
  const name = document.getElementById("checkout-name").value;
  const phone = document.getElementById("checkout-phone").value;
  const email = document.getElementById("checkout-email").value;
  const address = document.getElementById("checkout-address").value;
  
  if (!name || !phone || !email || !address) {
    showNotification("Заполните все поля формы", "error");
    return;
  }
  
  // Создаем заказ
  const order = {
    userId: currentUser ? currentUser.uid : 'guest',
    userName: name,
    userPhone: phone,
    userEmail: email,
    userAddress: address,
    items: [],
    total: 0,
    date: new Date().toISOString(),
    status: 'новый'
  };
  
  // Добавляем товары в заказ
  let total = 0;
  for (const id of Object.keys(cart)) {
    const product = products.find(p => p.id === id);
    if (product) {
      const itemTotal = product.price * cart[id];
      total += itemTotal;
      
      order.items.push({
        id: product.id,
        title: product.title,
        price: product.price,
        quantity: cart[id],
        total: itemTotal
      });
    }
  }
  
  order.total = total;
  
  try {
    // Сохраняем заказ в Firestore
    const docRef = await db.collection('orders').add(order);
    order.id = docRef.id;
    orders.push(order);
    
    // Очищаем корзину
    cart = {};
    updateCartCount();
    await saveUserData();
    
    showNotification("Заказ принят! Спасибо за покупку.");
    closeModal();
    
    // Если админ вошел в систему, обновляем список заказов
    if (adminMode) {
      await loadOrders();
      renderAdminOrders();
    }
  } catch (error) {
    console.error("Ошибка оформления заказа:", error);
    showNotification("Ошибка оформления заказа", "error");
  }
}

// Загрузка изображений из Firebase Storage
async function loadImages() {
  const gallery = document.getElementById('gallery');
  if (!gallery) return;
  
  gallery.innerHTML = '';
  
  try {
    const storageRef = storage.ref('images');
    const result = await storageRef.listAll();
    
    if (result.items.length === 0) {
      gallery.innerHTML = '<p>Нет загруженных изображений</p>';
      return;
    }
    
    for (const itemRef of result.items) {
      const url = await itemRef.getDownloadURL();
      const img = document.createElement('img');
      img.src = url;
      img.style.width = '200px';
      img.style.height = '200px';
      img.style.objectFit = 'cover';
      img.style.margin = '10px';
      img.style.borderRadius = '8px';
      gallery.appendChild(img);
    }
  } catch (error) {
    console.error('Ошибка загрузки изображений:', error);
    gallery.innerHTML = '<p>Ошибка загрузки изображений</p>';
  }
}

// Загрузка изображения в Firebase Storage
async function uploadImage() {
  const file = document.getElementById('imageInput').files[0];
  if (!file) {
    showNotification('Выберите изображение', 'error');
    return;
  }
  
  try {
    const storageRef = storage.ref();
    const imageRef = storageRef.child(`images/${Date.now()}_${file.name}`);
    await imageRef.put(file);
    
    showNotification('Изображение успешно загружено!');
    loadImages();
  } catch (error) {
    console.error('Ошибка загрузки изображения:', error);
    showNotification('Ошибка загрузки изображения', 'error');
  }
}

// Регистрация пользователя
async function registerUser() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const email = document.getElementById("register-email").value.trim();
  
  if (!username || !password || !email) {
    showNotification("Заполните все поля", "error");
    return;
  }
  
  try {
    // Создаем пользователя с email и паролем
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;
    
    // Сохраняем дополнительную информацию о пользователе
    await db.collection('users').doc(user.uid).set({
      username,
      email,
      createdAt: new Date().toISOString()
    });
    
    showNotification("Регистрация успешна. Теперь вы можете войти.");
    
    // Автоматически входим после регистрации
    await loginUser();
  } catch (error) {
    showNotification("Ошибка регистрации: " + error.message, "error");
  }
}

// Вход пользователя
async function loginUser() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  
  if (!email || !password) {
    showNotification("Заполните email и пароль", "error");
    return;
  }
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showNotification("Вход выполнен успешно");
    closeModal();
  } catch (error) {
    showNotification("Ошибка входа: " + error.message, "error");
  }
}

// Выход пользователя
async function logoutUser() {
  try {
    await auth.signOut();
    currentUser = null;
    updateLoginUI();
    showNotification("Вы вышли из системы");
  } catch (error) {
    console.error("Ошибка выхода:", error);
  }
}

// Обновление UI в зависимости от статуса входа
function updateLoginUI() {
  const loginBtn = document.getElementById("login-btn");
  if (currentUser && currentUser.email) {
    loginBtn.innerHTML = '<i class="fas fa-user"></i> ' + currentUser.email;
    loginBtn.onclick = () => openUserProfile();
  } else {
    loginBtn.innerHTML = '<i class="fas fa-user"></i> Войти';
    loginBtn.onclick = () => openLoginModal();
  }
}

// Открытие профиля пользователя
function openUserProfile() {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  
  content.innerHTML = `
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <h3>Профиль пользователя</h3>
    <div class="form-group">
      <label>Email</label>
      <input type="email" value="${currentUser.email || ''}" disabled>
    </div>
    <button class="btn btn-detail" onclick="logoutUser()">Выйти</button>
  `;
  
  modal.classList.add('active');
}

// Открытие модального окна входа/регистрации
function openLoginModal() {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  
  content.innerHTML = `
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <h3>Вход / Регистрация</h3>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="login-email" placeholder="Введите email">
    </div>
    <div class="form-group">
      <label>Пароль</label>
      <input type="password" id="login-password" placeholder="Введите пароль">
    </div>
    <div class="form-group">
      <label>Имя пользователя (для регистрации)</label>
      <input type="text" id="register-username" placeholder="Введите имя пользователя">
    </div>
    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button class="btn btn-detail" onclick="loginUser()">Войти</button>
      <button class="btn btn-buy" onclick="registerUser()">Зарегистрироваться</button>
    </div>
  `;
  
  modal.classList.add('active');
}

// Настройка обработчиков событий
function setupEventListeners() {
  document.getElementById("search").addEventListener("input", function() {
    currentFilters.search = this.value;
    renderProducts();
  });
  
  document.getElementById("category").addEventListener("change", function() {
    currentFilters.category = this.value;
    renderProducts();
  });
  
  document.getElementById("sort").addEventListener("change", function() {
    currentFilters.sort = this.value;
    renderProducts();
  });
  
  document.getElementById("sort-mobile").addEventListener("change", function() {
    currentFilters.sort = this.value;
    renderProducts();
  });
  
  document.getElementById("rating-filter").addEventListener("change", function() {
    currentFilters.rating = this.value;
    renderProducts();
  });
  
  document.getElementById("in-stock").addEventListener("change", function() {
    currentFilters.inStock = this.checked;
    renderProducts();
  });

  // Закрытие модального окна при клике вне его
  document.getElementById("modal").addEventListener("click", function(e) {
    if(e.target === this) closeModal();
  });
}

// Отображение недавно просмотренных товаров
function renderRecentlyViewed() {
  const container = document.getElementById("recently-viewed");
  if (!container) return;
  
  if (recentlyViewed.length === 0) {
    container.innerHTML = '<p>Вы еще не просматривали товары</p>';
    return;
  }
  
  let html = '';
  
  recentlyViewed.forEach(id => {
    const product = products.find(p => p.id === id);
    if (product) {
      html += `
        <div class="recently-viewed-item">
          <img src="${product.image || 'https://picsum.photos/60/60'}" alt="${product.title}" onerror="this.src='https://picsum.photos/60/60'">
          <div class="recently-viewed-item-info">
            <div class="recently-viewed-item-title">${product.title}</div>
            <div class="recently-viewed-item-price">${product.price} ₴</div>
          </div>
        </div>
      `;
    }
  });
  
  container.innerHTML = html;
}

// Генерация HTML для звезд рейтинга
function getStarsHTML(rating) {
  let html = '';
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      html += '<i class="fas fa-star"></i>';
    } else if (i === fullStars && hasHalfStar) {
      html += '<i class="fas fa-star-half-alt"></i>';
    } else {
      html += '<i class="far fa-star"></i>';
    }
  }
  
  return html;
}

// Смена вида отображения товаров (сетка/список)
function changeView(view) {
  currentView = view;
  const grid = document.getElementById("product-grid");
  const options = document.querySelectorAll('.view-option');
  
  options.forEach(option => option.classList.remove('active'));
  document.querySelector(`.view-option:nth-child(${view === 'grid' ? 1 : 2})`).classList.add('active');
  
  if (view === 'list') {
    grid.classList.add('list-view');
  } else {
    grid.classList.remove('list-view');
  }
  
  renderProducts();
}

// Функция для загрузки XML-фида
async function loadFromFeed() {
  const messageElement = document.getElementById("feed-message");
  messageElement.textContent = "Загрузка данных...";
  
  // Получаем URL из сохраненных настроек
  const feedUrl = document.getElementById("feed-url").value;
  
  if (!feedUrl) {
    messageElement.textContent = "Введите URL фида";
    showNotification("Введите URL фида для загрузки", "error");
    return;
  }
  
  try {
    // Используем прокси для обхода CORS
    const proxyUrl = 'https://corsproxy.io/?';
    const response = await fetch(proxyUrl + encodeURIComponent(feedUrl));
    
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Проверяем, есть ли ошибки парсинга
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("Ошибка парсинга XML");
    }
    
    // Парсим XML в зависимости от структуры
    let items = [];
    const offers = xmlDoc.getElementsByTagName("offer");
    
    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i];
      const id = offer.getAttribute("id") || `feed-${i}`;
      const getValue = (tagName) => {
        const element = offer.getElementsByTagName(tagName)[0];
        return element ? element.textContent.trim() : "";
      };
      
      const title = getValue("name") || getValue("title") || getValue("model");
      const priceText = getValue("price");
      const price = priceText ? parseFloat(priceText.replace(/[^0-9.,]/g, "").replace(",", ".")) : 0;
      const description = getValue("description") || "";
      
      // Получаем URL изображения
      let image = "";
      const pictureElement = offer.getElementsByTagName("picture")[0];
      if (pictureElement) {
        image = pictureElement.textContent.trim();
      }
      
      // Получаем категорию
      const category = getValue("category") || "Без категории";
      
      items.push({
        id,
        title,
        price,
        description,
        image,
        category,
        fromFeed: true,
        inStock: true
      });
    }
    
    if (items.length === 0) {
      throw new Error("Не найдено товаров в фиде");
    }
    
    products = items;
    saveProducts();
    
    messageElement.textContent = `Загружено ${items.length} товаров`;
    renderProducts();
    showNotification("Данные успешно загружены из фида");
    
  } catch (error) {
    console.error("Ошибка загрузки фида:", error);
    messageElement.textContent = `Ошибка: ${error.message}`;
    showNotification("Ошибка загрузки данных из фида", "error");
  }
}

// Сохраняем URL фида
function saveFeedUrl() {
  const feedUrl = document.getElementById("feed-url").value;
  if (!feedUrl) {
    showNotification("Введите URL фида", "error");
    return;
  }
  
  try {
    // Проверяем, является ли введенный текст валидным URL
    new URL(feedUrl);
    showNotification("URL фида сохранен");
  } catch (e) {
    showNotification("Введите корректный URL", "error");
  }
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  const title = document.getElementById("products-title");
  const count = document.getElementById("products-count");
  
  let filteredProducts = [...products];
  
  // Фильтрация по категории
  if(currentFilters.category && currentFilters.category !== 'Все') {
    filteredProducts = filteredProducts.filter(p => p.category === currentFilters.category);
  }
  
  // Фильтрация по цене
  if(currentFilters.minPrice) {
    filteredProducts = filteredProducts.filter(p => p.price >= currentFilters.minPrice);
  }
  
  if(currentFilters.maxPrice) {
    filteredProducts = filteredProducts.filter(p => p.price <= currentFilters.maxPrice);
  }
  
  // Фильтрация по рейтингу
  if(currentFilters.rating) {
    const minRating = parseInt(currentFilters.rating);
    filteredProducts = filteredProducts.filter(p => getProductRating(p.id) >= minRating);
  }
  
  // Фильтрация по наличию
  if(currentFilters.inStock) {
    filteredProducts = filteredProducts.filter(p => p.inStock);
  }
  
  // Поиск
  if(currentFilters.search) {
    const searchTerm = currentFilters.search.toLowerCase();
    filteredProducts = filteredProducts.filter(p => 
      p.title.toLowerCase().includes(searchTerm) || 
      (p.description && p.description.toLowerCase().includes(searchTerm))
    );
  }
  
  // Показ избранного
  if(showingFavorites) {
    filteredProducts = filteredProducts.filter(p => favorites[p.id]);
    title.textContent = "Избранные товары";
  } else {
    title.textContent = currentFilters.category ? `Товары: ${currentFilters.category}` : "Все товары";
  }
  
  // Сортировка
  switch(currentFilters.sort) {
    case 'price-asc':
      filteredProducts.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      filteredProducts.sort((a, b) => b.price - a.price);
      break;
    case 'name-asc':
      filteredProducts.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'name-desc':
      filteredProducts.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case 'rating-desc':
      filteredProducts.sort((a, b) => getProductRating(b.id) - getProductRating(a.id));
      break;
  }
  
  count.textContent = `Найдено: ${filteredProducts.length}`;
  
  grid.innerHTML = "";
  
  if(filteredProducts.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #95a5a6;">
        <i class="fas fa-search" style="font-size: 48px; margin-bottom: 15px;"></i>
        <h3>Товары не найдены</h3>
        <p>Попробуйте изменить параметры фильтрации</p>
      </div>
    `;
    return;
  }
  
  filteredProducts.forEach(p => {
    const rating = getProductRating(p.id);
    const card = document.createElement("div");
    card.className = "card";
    
    card.innerHTML = `
      ${p.featured ? '<div class="card-badge">Хит</div>' : ''}
      <img src="${p.image || 'https://picsum.photos/200'}" alt="${p.title}" onerror="this.src='https://picsum.photos/200'">
      <h3>${p.title}</h3>
      ${rating > 0 ? `
        <div class="rating">
          <div class="rating-stars">${getStarsHTML(rating)}</div>
          <div class="rating-count">${reviews[p.id] ? reviews[p.id].length : 0} отзывов</div>
        </div>
      ` : ''}
      <p>${p.description || "Описание отсутствует"}</p>
      <div class="price">${p.price ? p.price + " ₴" : "Цена по запросу"} ${p.oldPrice ? `<span class="old-price">${p.oldPrice} ₴</span>` : ''}</div>
      <div class="card-actions">
        <button class="btn btn-detail" onclick="openDetail('${p.id}')">
          <i class="fas fa-info-circle"></i>
        </button>
        <button class="btn btn-buy" onclick="addToCart('${p.id}')">
          <i class="fas fa-shopping-cart"></i>
        </button>
      </div>
      <div class="card-secondary-actions">
        <button class="btn-favorite ${favorites[p.id] ? 'active' : ''}" onclick="toggleFavorite('${p.id}')">
          <i class="${favorites[p.id] ? 'fas' : 'far'} fa-heart"></i>
        </button>
        <button class="btn-compare ${compare[p.id] ? 'active' : ''}" onclick="toggleCompare('${p.id}')">
          <i class="fas fa-balance-scale"></i>
        </button>
      </div>
      ${adminMode ? `<button class="btn" onclick="removeProduct('${p.id}')" style="margin-top: 10px;">Удалить</button>` : ""}
    `;
    
    grid.appendChild(card);
  });
  
  renderCategories();
}

function renderCategories() {
  const select = document.getElementById("category");
  const cats = ["Все", ...new Set(products.map(p => p.category || "Без категории"))];
  select.innerHTML = cats.map(c => `<option value="${c}" ${currentFilters.category === c ? 'selected' : ''}>${c}</option>`).join("");
}

function applyFilters() {
  currentFilters.category = document.getElementById("category").value;
  currentFilters.minPrice = document.getElementById("price-min").value ? parseInt(document.getElementById("price-min").value) : null;
  currentFilters.maxPrice = document.getElementById("price-max").value ? parseInt(document.getElementById("price-max").value) : null;
  currentFilters.sort = document.getElementById("sort").value;
  currentFilters.search = document.getElementById("search").value;
  currentFilters.rating = document.getElementById("rating-filter").value;
  currentFilters.inStock = document.getElementById("in-stock").checked;
  
  showingFavorites = false;
  renderProducts();
}

function resetFilters() {
  document.getElementById("category").value = "Все";
  document.getElementById("price-min").value = "";
  document.getElementById("price-max").value = "";
  document.getElementById("sort").value = "default";
  document.getElementById("sort-mobile").value = "default";
  document.getElementById("search").value = "";
  document.getElementById("rating-filter").value = "";
  document.getElementById("in-stock").checked = true;
  
  currentFilters = {
    category: '',
    minPrice: null,
    maxPrice: null,
    sort: 'default',
    search: '',
    rating: '',
    inStock: true
  };
  
  showingFavorites = false;
  renderProducts();
}

function toggleFavorites() {
  showingFavorites = !showingFavorites;
  const btn = document.getElementById("favorites-btn");
  
  if(showingFavorites) {
    btn.innerHTML = '<i class="fas fa-heart"></i>';
    btn.style.color = '#e74c3c';
  } else {
    btn.innerHTML = '<i class="far fa-heart"></i>';
    btn.style.color = '';
  }
  
  renderProducts();
}

async function toggleFavorite(id) {
  if(favorites[id]) {
    delete favorites[id];
    showNotification("Товар удален из избранного");
  } else {
    favorites[id] = true;
    showNotification("Товар добавлен в избранное");
  }
  
  await saveUserData();
  renderProducts();
}

function openCart(){
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  
  let html = `
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <h3><i class="fas fa-shopping-cart"></i> Корзина</h3>
  `;
  
  const cartIds = Object.keys(cart);
  
  if(cartIds.length === 0) {
    html += `
      <div class="empty-cart">
        <i class="fas fa-shopping-cart"></i>
        <h3>Корзина пуста</h3>
        <p>Добавьте товары из каталога</p>
      </div>
    `;
  } else {
    html += `<div class="cart-items">`;
    
    let total = 0;
    
    for(const id of cartIds) {
      const p = products.find(x => x.id === id);
      if(p) {
        const itemTotal = p.price * cart[id];
        total += itemTotal;
        
        html += `
          <div class="cart-item">
            <img src="${p.image || 'https://picsum.photos/200'}" alt="${p.title}" class="cart-item-image" onerror="this.src='https://picsum.photos/200'">
            <div class="cart-item-details">
              <div class="cart-item-title">${p.title}</div>
              <div class="cart-item-price">${p.price} ₴ × ${cart[id]} = ${itemTotal} ₴</div>
              <div class="cart-item-actions">
                <button class="quantity-btn" onclick="updateCartItem('${id}', ${cart[id] - 1})">-</button>
                <input type="number" class="quantity-input" value="${cart[id]}" min="1" onchange="updateCartItem('${id}', parseInt(this.value))">
                <button class="quantity-btn" onclick="updateCartItem('${id}', ${cart[id] + 1})">+</button>
                <button class="btn" onclick="updateCartItem('${id}', 0)" style="margin-left: 10px;">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }
    }
    
    html += `</div>`;
    html += `<div class="cart-total">Итого: ${total} ₴</div>`;
    html += `
      <div class="checkout-form active">
        <h4>Оформление заказа</h4>
        <div class="form-group">
          <label>Имя</label>
          <input type="text" id="checkout-name" required>
        </div>
        <div class="form-group">
          <label>Телефон</label>
          <input type="tel" id="checkout-phone" required>
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="checkout-email" required>
        </div>
        <div class="form-group">
          <label>Адрес доставки</label>
          <textarea id="checkout-address" required></textarea>
        </div>
        <button onclick="checkout()" class="btn btn-buy" style="width: 100%;">Оформить заказ</button>
      </div>
    `;
  }
  
  content.innerHTML = html;
  modal.classList.add('active');
}

async function openDetail(id){
  const p = products.find(x => x.id === id);
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  const rating = getProductRating(id);
  
  // Добавляем товар в недавно просмотренные
  addToRecentlyViewed(id);
  
  content.innerHTML = `
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <div class="product-detail">
      <div class="product-image">
        <img src="${p.image || 'https://picsum.photos/400/300'}" alt="${p.title}" onerror="this.src='https://picsum.photos/400/300'">
      </div>
      <div class="product-info">
        <h3>${p.title}</h3>
        ${rating > 0 ? `
          <div class="rating">
            <div class="rating-stars">${getStarsHTML(rating)}</div>
            <div class="rating-count">${rating.toFixed(1)} (${reviews[p.id] ? reviews[p.id].length : 0} отзывов)</div>
          </div>
        ` : ''}
        <div class="detail-price">${p.price} ₴ ${p.oldPrice ? `<span class="old-price">${p.oldPrice} ₴</span>` : ''}</div>
        <div class="product-description">${p.description || "Описание отсутствует"}</div>
        <div class="quantity-control">
          <label>Количество:</label>
          <button class="quantity-btn" onclick="this.nextElementSibling.stepDown();">-</button>
          <input type="number" class="quantity-input" id="detail-quantity" value="1" min="1">
          <button class="quantity-btn" onclick="this.previousElementSibling.stepUp();">+</button>
        </div>
        <div class="detail-actions">
          <button class="btn btn-buy" onclick="addToCart('${p.id}', parseInt(document.getElementById('detail-quantity').value)); closeModal();">
            <i class="fas fa-shopping-cart"></i> Добавить в корзину
          </button>
          <button class="btn btn-favorite ${favorites[p.id] ? 'active' : ''}" onclick="toggleFavorite('${p.id}')">
            <i class="${favorites[p.id] ? 'fas' : 'far'} fa-heart"></i>
          </button>
          <button class="btn btn-compare ${compare[p.id] ? 'active' : ''}" onclick="toggleCompare('${p.id}')">
            <i class="fas fa-balance-scale"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="product-reviews">
      <h4>Отзывы</h4>
      <div id="product-reviews-list">
        ${reviews[p.id] && reviews[p.id].length > 0 ? 
          reviews[p.id].map(review => `
            <div class="review">
              <div class="review-header">
                <span class="review-author">${review.author}</span>
                <span class="review-date">${review.date}</span>
              </div>
              <div class="rating-stars">${getStarsHTML(review.rating)}</div>
              <p>${review.text}</p>
              </div>
          `).join('') : 
          '<p>Пока нет отзывов о этом товаре</p>'
        }
      </div>
      <div class="add-review" style="margin-top: 20px;">
        <h4>Добавить отзыв</h4>
        <div class="form-group">
          <label>Имя</label>
          <input type="text" id="review-author">
        </div>
        <div class="form-group">
          <label>Оценка</label>
          <select id="review-rating">
            <option value="5">5 звезд</option>
            <option value="4">4 звезды</option>
            <option value="3">3 звезды</option>
            <option value="2">2 звезды</option>
            <option value="1">1 звезда</option>
          </select>
        </div>
        <div class="form-group">
          <label>Отзыв</label>
          <textarea id="review-text" rows="3"></textarea>
        </div>
        <button class="btn btn-detail" onclick="submitReview('${p.id}')">Добавить отзыв</button>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
}

async function submitReview(productId) {
  const author = document.getElementById('review-author').value.trim();
  const rating = parseInt(document.getElementById('review-rating').value);
  const text = document.getElementById('review-text').value.trim();
  
  if (!author || !text) {
    showNotification('Заполните все поля', 'error');
    return;
  }
  
  await addReview(productId, { author, rating, text });
  openDetail(productId); // Перезагружаем страницу товара чтобы показать новый отзыв
}

function closeModal(){ 
  document.getElementById("modal").classList.remove('active');
}

function showNotification(message, type = 'success') {
  const notification = document.getElementById("notification");
  const text = document.getElementById("notification-text");
  
  text.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function loginAdmin(){
  const pass = prompt("Введите пароль администратора:");
  if(pass === ADMIN_PASSWORD){
    adminMode = true;
    document.getElementById("admin-panel").style.display = "block";
    document.getElementById("admin-btn").style.display = "none";
    renderProducts();
    renderAdminOrders();
    showNotification("Режим администратора активирован");
  } else {
    alert("Неверный пароль!");
  }
}

function logoutAdmin(){
  adminMode = false;
  document.getElementById("admin-panel").style.display = "none";
  document.getElementById("admin-btn").style.display = "flex";
    renderProducts();
  showNotification("Режим администратора деактивирован");
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  const tabIndex = {
    'import-tab': 1, 
    'products-tab': 2, 
    'orders-tab': 3, 
    'reviews-tab': 4,
    'images-tab': 5
  }[tabId];
  
  document.querySelector(`.tab:nth-child(${tabIndex})`).classList.add('active');
  document.getElementById(tabId).classList.add('active');
  
  if (tabId === 'orders-tab') {
    renderAdminOrders();
  } else if (tabId === 'images-tab') {
    loadImages();
  }
}

// Отображение заказов в админ-панели
async function renderAdminOrders() {
  const container = document.getElementById("admin-orders-list");
  if (!container) return;
  
  await loadOrders();
  
  if (orders.length === 0) {
    container.innerHTML = '<p>Заказов нет</p>';
    return;
  }
  
  let html = '';
  
  // Сортируем заказов по дате (сначала новые)
  const sortedOrders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  sortedOrders.forEach(order => {
    html += `
      <div class="order-item">
        <div class="order-header">
          <div>
            <strong>Заказ #${order.id}</strong>
            <div>Дата: ${new Date(order.date).toLocaleString('ru-RU')}</div>
            <div>Статус: <span class="order-status" data-status="${order.status}">${order.status}</span></div>
          </div>
          <div>
            <div>Клиент: ${order.userName}</div>
            <div>Телефон: ${order.userPhone}</div>
            <div>Email: ${order.userEmail}</div>
          </div>
          <div>
            <div>Адрес доставки: ${order.userAddress}</div>
            ${order.userId !== 'guest' ? `<div>ID пользователя: ${order.userId}</div>` : ''}
          </div>
        </div>
        <div class="order-products">
          <h4>Товары в заказе:</h4>
          ${order.items.map(item => `
            <div class="order-product">
              <span>${item.title} (x${item.quantity})</span>
              <span>${item.total} ₴</span>
            </div>
          `).join('')}
        </div>
        <div class="order-total">
          Итого: ${order.total} ₴
        </div>
        <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-detail" onclick="changeOrderStatus('${order.id}', 'обработан')">Обработан</button>
          <button class="btn btn-buy" onclick="changeOrderStatus('${order.id}', 'доставлен')">Доставлен</button>
          <button class="btn" onclick="changeOrderStatus('${order.id}', 'отменен')" style="background: var(--danger); color: white;">Отменить</button>
          <button class="btn" onclick="deleteOrder('${order.id}')" style="background: var(--dark); color: white;">
            <i class="fas fa-trash"></i> Удалить
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Изменение статуса заказа
async function changeOrderStatus(orderId, status) {
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = status;
    await saveOrders();
    renderAdminOrders();
    showNotification(`Статус заказа #${orderId} изменен на "${status}"`);
  }
}

// Удаление заказа
async function deleteOrder(orderId) {
  if (confirm("Вы уверены, что хотите удалить этот заказ? Это действие нельзя отменить.")) {
    try {
      await db.collection('orders').doc(orderId).delete();
      orders = orders.filter(order => order.id !== orderId);
      renderAdminOrders();
      showNotification("Заказ успешно удален");
    } catch (error) {
      console.error("Ошибка удаления заказа:", error);
      showNotification("Ошибка удаления заказа", "error");
    }
  }
}

function removeProduct(id){
  if(confirm("Удалить товар?")){ 
    products = products.filter(p => p.id !== id); 
    saveProducts(); 
    renderProducts(); 
    showNotification("Товар удален");
  }
}

function clearCatalog(){ 
  if(confirm("Очистить каталог?")){ 
    products=[]; 
    saveProducts(); 
    renderProducts(); 
    showNotification("Каталог очищен");
  } 
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(products,null,2)],{type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); 
  a.download = "products.json"; 
  a.click();
  showNotification("JSON экспортирован");
}

// Открытие страницы сравнения
function openCompare() {
  const compareIds = Object.keys(compare);
  if (compareIds.length < 2) {
    showNotification('Выберите хотя бы 2 товара для сравнения', 'error');
    return;
  }
  
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  
  let html = `
    <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    <h3><i class="fas fa-balance-scale"></i> Сравнение товаров</h3>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 10px; border-bottom: 1px solid #ddd;">Характеристика</th>
  `;
  
  // Заголовки товаров
  compareIds.forEach(id => {
    const product = products.find(p => p.id === id);
    if (product) {
      html += `<th style="text-align: left; padding: 10px; border-bottom: 1px solid #ddd;">${product.title}</th>`;
    }
  });
  
  html += `</tr></thead><tbody>`;
  
  // Строка с изображениями
  html += `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Изображение</td>
  `;
  compareIds.forEach(id => {
    const product = products.find(p => p.id === id);
    html += `
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <img src="${product.image || 'https://picsum.photos/100/100'}" alt="${product.title}" style="width: 100px; height: 100px; object-fit: cover;" onerror="this.src='https://picsum.photos/100/100'">
      </td>
    `;
  });
  html += `</tr>`;
  
  // Строка с ценами
  html += `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Цена</td>
  `;
  compareIds.forEach(id => {
    const product = products.find(p => p.id === id);
    html += `<td style="padding: 10px; border-bottom: 1px solid #eee;">${product.price} ₴</td>`;
  });
  html += `</tr>`;
  
  // Строка с рейтингом
  html += `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Рейтинг</td>
  `;
  compareIds.forEach(id => {
    const rating = getProductRating(id);
    html += `
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <div class="rating">
          <div class="rating-stars">${getStarsHTML(rating)}</div>
          <div class="rating-count">${rating.toFixed(1)}</div>
        </div>
      </td>
    `;
  });
  html += `</tr>`;
  
  // Строка с описанием
  html += `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Описание</td>
  `;
  compareIds.forEach(id => {
    const product = products.find(p => p.id === id);
    html += `<td style="padding: 10px; border-bottom: 1px solid #eee;">${product.description || "Нет описания"}</td>`;
  });
  html += `</tr>`;
  
  // Строка с действиями
  html += `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">Действия</td>
  `;
  compareIds.forEach(id => {
    html += `
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <button class="btn btn-buy" onclick="addToCart('${id}', 1);">В корзину</button>
        <button class="btn btn-detail" onclick="openDetail('${id}')">Подробнее</button>
      </td>
    `;
  });
  html += `</tr>`;
  
  html += `</tbody></table></div>`;
  
  content.innerHTML = html;
  modal.classList.add('active');
}

// Переключение режима сравнения
function toggleCompare() {
  if (Object.keys(compare).length > 0) {
    openCompare();
  } else {
    showNotification('Добавьте товары для сравнения', 'error');
  }
}

// Инициализация при загрузке страницы
window.onload = init;