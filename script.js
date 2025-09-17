// Конфігурація Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCxAEDkZ57_yu1RDZ6xAEl7KkBgVli00b0",
  authDomain: "boltmaster-2025.firebaseapp.com",
  projectId: "boltmaster-2025",
  storageBucket: "boltmaster-2025.firebasestorage.app",
  messagingSenderId: "995027194761",
  appId: "1:995027194761:web:d3464fefcc6eb41129c758"
};

// Ініціалізація Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Константи додатка
const ADMIN_PASSWORD = "Lenok1378@";
const CART_STORAGE_KEY = "electrotools_cart";
const FAVORITES_STORAGE_KEY = "electrotools_favorites";
const FEED_URL_KEY = "electrotools_feed_url";
const FEED_UPDATE_TIME_KEY = "electrotools_feed_update";
const VIEW_MODE_KEY = "electrotools_view_mode";
const ADMINS_STORAGE_KEY = "electrotools_admins";

let products = [];
let cart = {};
let favorites = {};
let adminMode = false;
let showingFavorites = false;
let currentUser = null;
let currentPage = 1;
const productsPerPage = 12;
let currentFilters = {
  category: '',
  brand: '',
  minPrice: null,
  maxPrice: null,
  sort: 'default',
  search: '',
  availability: ''
};

// Функція для налаштування лічильника переглядів
function setupPageCounter() {
  const params = new URLSearchParams({
      style: 'flat-square',
      label: 'Views',
      color: 'blue',
      logo: 'firebase'
  });

  // Беремо шлях поточної сторінки
  const currentPath = window.location.pathname;

  // Робимо лічильник для boltmaster-2025.web.app
  const counterURL = `https://hits.sh/boltmaster-2025.web.app${currentPath}.svg?${params.toString()}`;
  const pageViewsElement = document.getElementById('page-views');
  if (pageViewsElement) {
      pageViewsElement.src = counterURL;
  }
}

// Додаємо нову функцію для завантаження товарів з JSON файлу
function loadProductsFromJson() {
  return fetch('products.json')
    .then(response => {
      if (!response.ok) {
        // Пробуємо завантажити з локального сховища
        const backup = localStorage.getItem('products_backup');
        if (backup) {
          return JSON.parse(backup);
        }
        throw new Error('Файл products.json не знайдено');
      }
      return response.json();
    })
    .then(data => {
      if (Array.isArray(data)) {
        return data;
      } else {
        throw new Error('Невірний формат файлу products.json');
      }
    });
}

// Ініціалізація додатка
function initApp() {
  // Перевіряємо статус аутентифікації
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      document.getElementById('login-btn').style.display = 'none';
      document.getElementById('user-menu').style.display = 'inline-block';
      document.getElementById('admin-access-btn').style.display = 'inline-block';
      document.getElementById('user-name').textContent = user.displayName || user.email;
      
      // Перевіряємо, чи є користувач адміністратором
      checkAdminStatus(user.uid);
    } else {
      currentUser = null;
      document.getElementById('login-btn').style.display = 'inline-block';
      document.getElementById('user-menu').style.display = 'none';
      document.getElementById('admin-access-btn').style.display = 'none';
      document.getElementById("admin-panel").style.display = "none";
      adminMode = false;
      document.getElementById("page-views-container").style.display = "none";
    }
  });
  
  // Намагаємося завантажити продукти з Firestore
  loadProducts().catch(error => {
    console.error("Помилка завантаження з Firestore, пробуємо завантажити з JSON:", error);
    
    // Якщо не вдалося завантажити з Firestore, пробуємо завантажити з JSON
    loadProductsFromJson()
      .then(jsonProducts => {
        products = jsonProducts;
        updateCartCount();
        renderProducts();
        renderFeaturedProducts();
        renderCategories();
        renderBrands();
        showNotification("Товари завантажено з локального файлу");
        
        // Зберігаємо продукти в localStorage як резервну копію
        localStorage.setItem('products_backup', JSON.stringify(products));
      })
      .catch(jsonError => {
        console.error("Помилка завантаження з JSON:", jsonError);
        showNotification("Не вдалося завантажити товари", "error");
      });
  });
  
  // Завантажуємо обране та кошик з localStorage
  const cartData = localStorage.getItem(CART_STORAGE_KEY);
  if(cartData) cart = JSON.parse(cartData);
  
  const favoritesData = localStorage.getItem(FAVORITES_STORAGE_KEY);
  if(favoritesData) favorites = JSON.parse(favoritesData);
  
  // Завантажуємо налаштування виду
  const viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'grid';
  setViewMode(viewMode);
  
  updateCartCount();
  
  // Завантажуємо збережений URL фіду
  const feedUrl = localStorage.getItem(FEED_URL_KEY);
  if (feedUrl) {
    document.getElementById("feed-url").value = feedUrl;
  }
  
  // Встановлюємо поточний рік у футері
  document.getElementById("year").innerText = new Date().getFullYear();
  
  // Додаємо обробники подій
  document.getElementById('search').addEventListener('input', function() {
    currentFilters.search = this.value;
    applyFilters();
  });
  
  document.getElementById('category').addEventListener('change', function() {
    currentFilters.category = this.value;
    applyFilters();
  });
  
  document.getElementById('brand').addEventListener('change', function() {
    currentFilters.brand = this.value;
    applyFilters();
  });
  
  document.getElementById('sort').addEventListener('change', function() {
    currentFilters.sort = this.value;
    applyFilters();
  });
  
  document.getElementById('availability').addEventListener('change', function() {
    currentFilters.availability = this.value;
    applyFilters();
  });
  
  // Додаємо обробники для фільтрів ціни
  document.getElementById('price-min').addEventListener('change', function() {
    currentFilters.minPrice = this.value ? parseInt(this.value) : null;
    applyFilters();
  });
  
  document.getElementById('price-max').addEventListener('change', function() {
    currentFilters.maxPrice = this.value ? parseInt(this.value) : null;
    applyFilters();
  });
}

// Оновлюємо функцію loadProducts для обробки випадку, коли в Firestore немає товарів
function loadProducts() {
  // Перевіряємо кеш перед завантаженням
  const cachedProducts = localStorage.getItem('products_cache');
  const cacheTime = localStorage.getItem('products_cache_time');
  
  if (cachedProducts && cacheTime && Date.now() - cacheTime < 300000) { // 5 хвилин
    products = JSON.parse(cachedProducts);
    renderProducts();
    return Promise.resolve();
  }
  
  showLoadingSkeleton();
  
  return db.collection("products")
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        // Якщо в Firestore немає товарів, пробуємо завантажити з localStorage
        const data = localStorage.getItem('products_backup');
        if (data) {
          products = JSON.parse(data);
          updateCartCount();
          renderProducts();
          renderFeaturedProducts();
          renderCategories();
          renderBrands();
          return Promise.resolve();
        } else {
          // Якщо в localStorage теж немає, пробуємо завантажити з JSON
          return loadProductsFromJson()
            .then(jsonProducts => {
              products = jsonProducts;
              updateCartCount();
              renderProducts();
              renderFeaturedProducts();
              renderCategories();
              renderBrands();
              showNotification("Товари завантажено з локального файлу");
              
              // Зберігаємо продукти в localStorage як резервну копію
              localStorage.setItem('products_backup', JSON.stringify(products));
            });
        }
      } else {
        products = [];
        querySnapshot.forEach((doc) => {
          products.push({ id: doc.id, ...doc.data() });
        });
        
        // Зберігаємо в кеш
        localStorage.setItem('products_cache', JSON.stringify(products));
        localStorage.setItem('products_cache_time', Date.now());
        
        updateCartCount();
        renderProducts();
        renderFeaturedProducts();
        renderCategories();
        renderBrands();
        return Promise.resolve();
      }
    })
    .catch((error) => {
      console.error("Помилка завантаження продуктів: ", error);
      showNotification("Помилка завантаження продуктів", "error");
      
      // Пробуємо завантажити з localStorage, якщо Firestore недоступний
      const data = localStorage.getItem('products_backup');
      if (data) {
        products = JSON.parse(data);
        updateCartCount();
        renderProducts();
        renderFeaturedProducts();
        renderCategories();
        renderBrands();
        return Promise.resolve();
      } else {
        // Передаємо помилку далі для обробки в initApp
        return Promise.reject(error);
      }
    });
}

// ===== ФУНКЦІЇ ПАГІНАЦІЇ =====

// Функція для зміни сторінки в пагінації
function changePage(page) {
  currentPage = page;
  showLoadingSkeleton();
  
  // Використовуємо setTimeout для плавного переходу
  setTimeout(() => {
    renderProducts();
    updatePagination();
    // Прокручуємо сторінку вгору для зручності перегляду
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 100);
}

// Оновлення відображення пагінації
function updatePagination() {
  const paginationContainer = document.getElementById("pagination");
  if (!paginationContainer) return; // Додана перевірка
  
  // Розраховуємо загальну кількість сторінок
  let filteredProducts = getFilteredProducts();
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  
  // Якщо сторінок немає або всього одна, приховуємо пагінацію
  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }
  
  paginationContainer.style.display = 'flex';
  
  // Очищаємо контейнер пагінації
  paginationContainer.innerHTML = '';
  
  // Додаємо кнопку "Назад"
  const prevButton = document.createElement('button');
  prevButton.innerHTML = '&laquo;';
  prevButton.disabled = currentPage === 1;
  prevButton.onclick = () => changePage(currentPage - 1);
  paginationContainer.appendChild(prevButton);
  
  // Визначаємо діапазон відображуваних сторінок
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  // Корегуємо startPage, якщо ми в кінці діапазону
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }
  
  // Додаємо кнопки пагінації
  for (let i = startPage; i <= endPage; i++) {
    const button = document.createElement('button');
    button.textContent = i;
    button.classList.toggle('active', i === currentPage);
    button.onclick = () => changePage(i);
    paginationContainer.appendChild(button);
  }
  
  // Додаємо кнопку "Вперед"
  const nextButton = document.createElement('button');
  nextButton.innerHTML = '&raquo;';
  nextButton.disabled = currentPage === totalPages;
  nextButton.onclick = () => changePage(currentPage + 1);
  paginationContainer.appendChild(nextButton);
}

// Отримання відфільтрованих продуктів (допоміжна функція)
function getFilteredProducts() {
  let filteredProducts = [...products];
  
  if (showingFavorites) {
    filteredProducts = filteredProducts.filter(product => favorites[product.id]);
  }
  
  if (currentFilters.search) {
    const searchTerm = currentFilters.search.toLowerCase();
    filteredProducts = filteredProducts.filter(product => 
      product.title.toLowerCase().includes(searchTerm) || 
      product.description.toLowerCase().includes(searchTerm)
    );
  }
  
  if (currentFilters.category) {
    filteredProducts = filteredProducts.filter(product => 
      product.category === currentFilters.category
    );
  }
  
  if (currentFilters.brand) {
    filteredProducts = filteredProducts.filter(product => 
      product.brand === currentFilters.brand
    );
  }
  
  if (currentFilters.minPrice) {
    filteredProducts = filteredProducts.filter(product => 
      product.price >= currentFilters.minPrice
    );
  }
  
  if (currentFilters.maxPrice) {
    filteredProducts = filteredProducts.filter(product => 
      product.price <= currentFilters.maxPrice
    );
  }
  
  if (currentFilters.availability) {
    filteredProducts = filteredProducts.filter(product => 
      currentFilters.availability === 'in-stock' ? product.inStock : !product.inStock
    );
  }
  
  // Застосовуємо сортування
  switch (currentFilters.sort) {
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
    default:
      // За замовчуванням - без сортування
      break;
  }
  
  return filteredProducts;
}

// ===== КІНЕЦЬ ФУНКЦІЇ ПАГІНАЦІЇ =====

// Функція для завантаження XML-фіду
async function loadFromFeed() {
  const messageElement = document.getElementById("feed-message");
  messageElement.textContent = "Завантаження даних...";
  
  // Отримуємо URL із збережених налаштувань
  const feedUrl = localStorage.getItem(FEED_URL_KEY) || document.getElementById("feed-url").value;
  
  if (!feedUrl) {
    messageElement.textContent = "Введіть URL фіду";
    showNotification("Введіть URL фіду для завантаження");
    return;
  }
  
  // Зберігаємо URL, якщо він був введений в поле
  if (document.getElementById("feed-url").value) {
    localStorage.setItem(FEED_URL_KEY, document.getElementById("feed-url").value);
  }
  
  try {
    // Використовуємо проксі для обходу CORS
    const proxyUrl = 'https://corsproxy.io/?';
    const response = await fetch(proxyUrl + encodeURIComponent(feedUrl));
    
    if (!response.ok) {
      throw new Error(`Помилка HTTP: ${response.status}`);
    }
    
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    // Перевіряємо, чи є помилки парсингу
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("Помилка парсингу XML");
    }
    
    // Парсимо XML залежно від структури
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
      const brand = getValue("vendor") || getValue("brand") || "Невідомо";
      
      // Отримуємо URL зображення
      let image = "";
      const pictureElement = offer.getElementsByTagName("picture")[0];
      if (pictureElement) {
        image = pictureElement.textContent.trim();
      }
      
      // Отримуємо категорію
      const category = getValue("category") || "Без категорії";
      
      items.push({
        id,
        title,
        price,
        description,
        image: image, // Використовуємо оригінальний URL зображення
        category,
        brand,
        fromFeed: true,
        inStock: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    if (items.length === 0) {
      throw new Error("Не знайдено товарів у фіді");
    }
    
    // Зберігаємо товари в Firestore
    const batch = db.batch();
    const productsRef = db.collection("products");
    
    for (const item of items) {
      const productRef = productsRef.doc(item.id);
      batch.set(productRef, item, { merge: true });
    }
    
    await batch.commit();
    
    // Зберігаємо час останнього оновлення
    localStorage.setItem(FEED_UPDATE_TIME_KEY, new Date().getTime());
    
    messageElement.textContent = `Завантажено ${items.length} товарів`;
    showNotification("Дані успішно завантажені з фіду");
    
  } catch (error) {
    console.error("Помилка завантаження фіду:", error);
    messageElement.textContent = `Помилка: ${error.message}`;
    showNotification("Помилка завантаження даних з фіду", "error");
  }
}

// Збереження продуктів в Firestore
function saveProduct(product) {
  const productData = {
    ...product,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  if (!product.id) {
    productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    productData.id = generateId();
  }
  
  const productRef = db.collection("products").doc(productData.id);
  
  return productRef.set(productData, { merge: true })
    .then(() => {
      showNotification("Товар успішно збережено");
      loadProducts(); // Перезавантажуємо список товарів
      return productData.id;
    })
    .catch((error) => {
      console.error("Помилка збереження товару: ", error);
      showNotification("Помилка збереження товару", "error");
      
      // Зберігаємо в localStorage як запасний варіант
      if (!product.id) {
        product.id = generateId();
        products.push(product);
      } else {
        const index = products.findIndex(p => p.id === product.id);
        if (index !== -1) {
          products[index] = product;
        } else {
          products.push(product);
        }
      }
      
      localStorage.setItem('products_backup', JSON.stringify(products));
      renderProducts();
      
      return product.id;
    });
}

// Генерація ID для нового товару
function generateId() {
  return 'product-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Показати скелетон завантаження
function showLoadingSkeleton() {
  const grid = document.getElementById("product-grid");
  grid.innerHTML = '';
  
  for (let i = 0; i < 8; i++) {
    const skeleton = document.createElement("div");
    skeleton.className = "card";
    skeleton.innerHTML = `
      <div class="skeleton-img"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text" style="width: 80%;"></div>
      <div class="skeleton-price"></div>
      <div class="skeleton-text" style="height: 36px; margin-top: 15px;"></div>
    `;
    grid.appendChild(skeleton);
  }
}

// Рендеринг продуктів
function renderProducts() {
  const grid = document.getElementById("product-grid");
  if (!grid) return; // Захист від відсутності елемента
  
  grid.innerHTML = '';
  
  // Отримуємо відфільтровані продукти
  let filteredProducts = getFilteredProducts();
  
  // Оновлюємо заголовок і лічильник
  document.getElementById('products-title').textContent = showingFavorites ? 'Обрані товари' : 'Всі товари';
  document.getElementById('products-count').textContent = `Знайдено: ${filteredProducts.length}`;
  
  // Застосовуємо пагінацію
  const startIndex = (currentPage - 1) * productsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + productsPerPage);
  
  // Рендеримо продукти
  if (paginatedProducts.length === 0) {
    grid.innerHTML = `
      <div class="empty-cart">
        <i class="fas fa-search"></i>
        <h3>Товари не знайдено</h3>
        <p>Спробуйте змінити параметри фільтрації</p>
      </div>
    `;
    updatePagination();
    return;
  }
  
  const viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'grid';
  const isListView = viewMode === 'list';
  
  if (isListView) {
    grid.classList.add('list-view');
  } else {
    grid.classList.remove('list-view');
  }
  
  paginatedProducts.forEach(product => {
    const card = document.createElement("div");
    card.className = "card";
    
    // Перевіряємо, чи доданий товар в обране
    const isFavorite = favorites[product.id];
    
    card.innerHTML = `
      ${product.discount ? `<div class="card-discount">-${product.discount}%</div>` : ''}
      ${product.isNew ? '<div class="card-badge">Новинка</div>' : ''}
      <img src="${product.image || 'https://via.placeholder.com/300x200?text=No+Image'}" alt="${product.title}">
      <h3>${product.title}</h3>
      <p>${product.description || 'Опис відсутній'}</p>
      <div class="price-container">
        <span class="price">${formatPrice(product.price)} ₴</span>
        ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)} ₴</span>` : ''}
      </div>
      
      <div class="card-actions">
        <button class="btn btn-buy" onclick="addToCart('${product.id}')">
          <i class="fas fa-shopping-cart"></i> Купити
        </button>
        <button class="btn btn-detail" onclick="showProductDetail('${product.id}')">
          <i class="fas fa-info"></i> Детальніше
        </button>
        <button class="btn-favorite ${isFavorite ? 'active' : ''}" onclick="toggleFavorite('${product.id}')">
          <i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i>
        </button>
      </div>
    `;
    
    grid.appendChild(card);
  });
  
  updatePagination();
}

// Рендеринг обраних товарів
function renderFeaturedProducts() {
  const featuredContainer = document.getElementById("featured-products");
  featuredContainer.innerHTML = '';
  
  // Беремо перші 5 товарів
  const featuredProducts = products.slice(0, 5);
  
  featuredProducts.forEach(product => {
    const item = document.createElement("div");
    item.className = "featured-item";
    item.innerHTML = `
      <img src="${product.image || 'https://via.placeholder.com/60x60?text=No+Image'}" alt="${product.title}">
      <div class="featured-item-info">
        <h4 class="featured-item-title">${product.title}</h4>
        <div class="featured-item-price">${formatPrice(product.price)} ₴</div>
      </div>
    `;
    
    item.addEventListener('click', () => showProductDetail(product.id));
    featuredContainer.appendChild(item);
  });
}

// Рендеринг категорії
function renderCategories() {
  const categorySelect = document.getElementById("category");
  
  // Очищаємо всі опції крім першої
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }
  
  // Отримуємо унікальні категорії
  const categories = [...new Set(products.map(product => product.category))].filter(Boolean);
  
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

// Рендеринг брендів
function renderBrands() {
  const brandSelect = document.getElementById("brand");
  
  // Очищаємо всі опції крім першої
  while (brandSelect.options.length > 1) {
    brandSelect.remove(1);
  }
  
  // Отримуємо унікальні бренди
  const brands = [...new Set(products.map(product => product.brand))].filter(Boolean);
  
  brands.forEach(brand => {
    const option = document.createElement("option");
    option.value = brand;
    option.textContent = brand;
    brandSelect.appendChild(option);
  });
}

// Форматування ціни
function formatPrice(price) {
  return new Intl.NumberFormat('uk-UA').format(price);
}

// Показати сповіщення
function showNotification(message, type = "success") {
  const notification = document.getElementById("notification");
  const text = document.getElementById("notification-text");
  text.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.add("show");
  
  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

// Додавання товару в кошик
function addToCart(productId) {
  if (!cart[productId]) {
    cart[productId] = 0;
  }
  cart[productId]++;
  
  // Зберігаємо кошик в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  showNotification("Товар додано до кошика");
}

// Оновлення лічильника кошика
function updateCartCount() {
  const count = Object.values(cart).reduce((total, qty) => total + qty, 0);
  document.getElementById("cart-count").textContent = count;
}

// Додавання/видалення з обраного
function toggleFavorite(productId) {
  if (favorites[productId]) {
    delete favorites[productId];
  } else {
    favorites[productId] = true;
  }
  
  // Зберігаємо обране в localStorage
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  
  // Перемальовуємо продукти, якщо знаходимось у режимі обраного
  if (showingFavorites) {
    renderProducts();
  } else {
    // Інакше просто оновлюємо іконку серця у товару
    const heartIcon = document.querySelector(`button[onclick="toggleFavorite('${productId}')"] i`);
    if (heartIcon) {
      heartIcon.className = favorites[productId] ? 'fas fa-heart' : 'far fa-heart';
      heartIcon.parentElement.className = `btn-favorite ${favorites[productId] ? 'active' : ''}`;
    }
  }
  
  showNotification(favorites[productId] ? "Додано в обране" : "Видалено з обраного");
}

// Переключення режиму відображення обраного
function toggleFavorites() {
  showingFavorites = !showingFavorites;
  
  const favButton = document.getElementById("favorites-btn");
  if (showingFavorites) {
    favButton.innerHTML = '<i class="fas fa-heart"></i>';
    favButton.style.color = '#e74c3c';
  } else {
    favButton.innerHTML = '<i class="far fa-heart"></i>';
    favButton.style.color = '';
  }
  
  applyFilters();
}

// Застосування фільтрів
function applyFilters() {
  // Отримуємо значення ціни
  const minPrice = document.getElementById("price-min").value ? parseInt(document.getElementById("price-min").value) : null;
  const maxPrice = document.getElementById("price-max").value ? parseInt(document.getElementById("price-max").value) : null;
  
  // Оновлюємо фільтри
  currentFilters.minPrice = minPrice;
  currentFilters.maxPrice = maxPrice;
  currentFilters.category = document.getElementById("category").value;
  currentFilters.brand = document.getElementById("brand").value;
  currentFilters.availability = document.getElementById("availability").value;
  currentFilters.sort = document.getElementById("sort").value;
  
  currentPage = 1;
  renderProducts();
  
  // Оновлюємо лічильник товарів
  const filteredProducts = getFilteredProducts();
  document.getElementById('products-count').textContent = `Знайдено: ${filteredProducts.length}`;
}

// Скидання фільтрів
function resetFilters() {
  document.getElementById("price-min").value = '';
  document.getElementById("price-max").value = '';
  document.getElementById("category").value = '';
  document.getElementById("brand").value = '';
  document.getElementById("availability").value = '';
  document.getElementById("sort").value = 'default';
  document.getElementById("search").value = '';
  
  currentFilters = {
    category: '',
    brand: '',
    minPrice: null,
    maxPrice: null,
    sort: 'default',
    search: '',
    availability: ''
  };
  
  applyFilters();
}

// Встановлення режиму перегляду
function setViewMode(mode) {
  localStorage.setItem(VIEW_MODE_KEY, mode);
  
  const gridBtn = document.getElementById("grid-view");
  const listBtn = document.getElementById("list-view");
  
  if (mode === 'grid') {
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
  } else {
    gridBtn.classList.remove('active');
    listBtn.classList.add('active');
  }
  
  renderProducts();
}

// Показати деталі товару
function showProductDetail(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>${product.title}</h3>
    <div class="product-detail">
      <div class="product-image">
        <img src="${product.image || 'https://via.placeholder.com/400x300?text=No+Image'}" alt="${product.title}">
      </div>
      <div class="product-info">
        <div class="price-container">
          <span class="detail-price">${formatPrice(product.price)} ₴</span>
          ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)} ₴</span>` : ''}
        </div>
        <div class="product-meta">
          <div><i class="fas fa-box"></i> ${product.inStock ? 'В наявності' : 'Немає в наявності'}</div>
          <div><i class="fas fa-truck"></i> Доставка за 1-2 дні</div>
          <div><i class="fas fa-shield-alt"></i> Гарантія 12 місяців</div>
        </div>
        <div class="product-description">
          <h4>Опис</h4>
          <p>${product.description || 'Опис відсутній'}</p>
        </div>
        <div class="quantity-control">
          <button class="quantity-btn" onclick="changeQuantity(-1)">-</button>
          <input type="number" class="quantity-input" id="product-quantity" value="1" min="1">
          <button class="quantity-btn" onclick="changeQuantity(1)">+</button>
        </div>
        <div class="detail-actions">
          <button class="btn btn-buy" onclick="addToCartWithQuantity('${product.id}')">
            <i class="fas fa-shopping-cart"></i> Додати до кошика
          </button>
          <button class="btn-favorite ${favorites[product.id] ? 'active' : ''}" onclick="toggleFavorite('${product.id}')">
            <i class="${favorites[product.id] ? 'fas' : 'far'} fa-heart"></i>
          </button>
        </div>
      </div>
    </div>
  `;
  
  openModal();
}

// Додавання товару в кошик із зазначеною кількістю
function addToCartWithQuantity(productId) {
  const quantity = parseInt(document.getElementById("product-quantity").value) || 1;
  
  if (!cart[productId]) {
    cart[productId] = 0;
  }
  cart[productId] += quantity;
  
  // Зберігаємо кошик в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  showNotification("Товар додано до кошика");
  closeModal();
}

// Зміна кількості товару
function changeQuantity(delta) {
  const input = document.getElementById("product-quantity");
  let value = parseInt(input.value) || 1;
  value += delta;
  
  if (value < 1) value = 1;
  
  input.value = value;
}

// Відкриття кошика
function openCart() {
  const modalContent = document.getElementById("modal-content");
  
  if (Object.keys(cart).length === 0) {
    modalContent.innerHTML = `
      <h3>Кошик</h3>
      <div class="empty-cart">
        <i class="fas fa-shopping-cart"></i>
        <h3>Кошик порожній</h3>
        <p>Додайте товари з каталогу</p>
      </div>
    `;
  } else {
    let total = 0;
    let cartItemsHTML = '';
    
    for (const [productId, quantity] of Object.entries(cart)) {
      const product = products.find(p => p.id === productId);
      if (product) {
        const itemTotal = product.price * quantity;
        total += itemTotal;
        
        cartItemsHTML += `
          <div class="cart-item">
            <img src="${product.image || 'https://via.placeholder.com/80x80?text=No+Image'}" alt="${product.title}" class="cart-item-image">
            <div class="cart-item-details">
              <h4 class="cart-item-title">${product.title}</h4>
              <div class="cart-item-price">${formatPrice(product.price)} ₴ x ${quantity} = ${formatPrice(itemTotal)} ₴</div>
              <div class="cart-item-actions">
                <button class="btn" onclick="changeCartQuantity('${productId}', -1)">-</button>
                <span>${quantity}</span>
                <button class="btn" onclick="changeCartQuantity('${productId}', 1)">+</button>
                <button class="btn" onclick="removeFromCart('${productId}')"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
        `;
      }
    }
    
    modalContent.innerHTML = `
      <h3>Кошик</h3>
      <div class="cart-items">
        ${cartItemsHTML}
      </div>
      <div class="cart-footer">
        <div class="cart-total">Разом: ${formatPrice(total)} ₴</div>
        <button class="btn btn-buy" onclick="checkout()">Оформити замовлення</button>
      </div>
    `;
  }
  
  openModal();
}

// Зміна кількості товару в кошику
function changeCartQuantity(productId, delta) {
  if (!cart[productId] && delta < 1) return; // Захист від від'ємної кількості
  
  cart[productId] += delta;
  
  if (cart[productId] < 1) {
    delete cart[productId];
  }
  
  // Зберігаємо кошик в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  openCart(); // Перемальовуємо кошик
}

// Видалення товару з кошика
function removeFromCart(productId) {
  delete cart[productId];
  
  // Зберігаємо кошик в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  openCart(); // Перемальовуємо кошик
}

// ===== ОФОРМЛЕННЯ ЗАМОВЛЕННЯ =====
function checkout() {
  if (!currentUser) {
    closeModal();
    openAuthModal();
    showNotification("Для оформлення замовлення необхідно авторизуватися", "warning");
    return;
  }

  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Оформлення замовлення</h3>
    <form class="checkout-form" onsubmit="placeOrder(event)">
      <div class="form-row">
        <div class="form-group">
          <label>Ім'я та прізвище*</label>
          <input type="text" id="order-name" required value="${currentUser.displayName || ''}">
        </div>
        <div class="form-group">
          <label>Телефон*</label>
          <input type="tel" id="order-phone" required placeholder="+380XXXXXXXXX">
        </div>
      </div>
      <div class="form-group">
        <label>Email*</label>
        <input type="email" id="order-email" required value="${currentUser.email || ''}">
      </div>
      
      <div class="delivery-section">
        <h4>Доставка Новою Поштою</h4>
        <div class="delivery-notice">
          <i class="fas fa-info-circle"></i>
          <p>Доставка здійснюється за тарифами перевізника. Вартість доставки розраховується окремо та оплачується при отриманні замовлення.</p>
        </div>
        <div class="form-group">
          <label>Місто*</label>
          <input type="text" id="np-city" required placeholder="Введіть ваше місто">
        </div>
        <div class="form-group">
          <label>Відділення Нової Пошти*</label>
          <input type="text" id="np-warehouse" required placeholder="Номер відділення">
        </div>
      </div>
      
      <div class="payment-section">
        <h4>Спосіб оплати</h4>
        <div class="payment-options">
          <label class="payment-option">
            <input type="radio" name="payment" value="cash" checked>
            <span>Готівкою при отриманні</span>
          </label>
          <label class="payment-option">
            <input type="radio" name="payment" value="card">
            <span>Онлайн-оплата карткою</span>
          </label>
        </div>
      </div>
      
      <div class="order-summary">
        <h4>Ваше замовлення</h4>
        <div class="order-items">
          ${generateOrderSummary()}
        </div>
        <div class="order-total">
          <div class="total-line">
            <span>Сума замовлення:</span>
            <span>${formatPrice(calculateCartTotal())} ₴</span>
          </div>
          <div class="total-line">
            <span>Доставка:</span>
            <span>Згідно тарифів перевізника</span>
          </div>
          <div class="total-line final-total">
            <span>Разом:</span>
            <span>${formatPrice(calculateCartTotal())} ₴</span>
          </div>
        </div>
      </div>
      
      <button type="submit" class="btn btn-buy">Підтвердити замовлення</button>
    </form>
  `;
  
  openModal();
}

// ===== ЗБЕРЕЖЕННЯ ЗАМОВЛЕННЯ В FIREBASE =====
function placeOrder(event) {
  event.preventDefault();
  
  if (!currentUser || !currentUser.uid) {
    closeModal();
    openAuthModal();
    showNotification("Для оформлення замовлення необхідно авторизуватися", "warning");
    return;
  }
  
  // Отримуємо дані форми
  const name = document.getElementById('order-name').value.trim();
  const phone = document.getElementById('order-phone').value.trim();
  const email = document.getElementById('order-email').value.trim();
  const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
  
  // Валідація даних
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showNotification("Введіть коректну email адресу", "error");
    return;
  }
  
  const phoneRegex = /^[\+]?[0-9]{10,15}$/;
  const cleanPhone = phone.replace(/\D/g, '');
  if (!phoneRegex.test(cleanPhone)) {
    showNotification("Введіть коректний номер телефону", "error");
    return;
  }
  
  // Отримуємо дані доставки
  const city = document.getElementById('np-city').value.trim();
  const warehouse = document.getElementById('np-warehouse').value.trim();
  
  if (!city || !warehouse) {
    showNotification('Заповніть всі поля для доставки Новою Поштою', 'error');
    return;
  }
  
  const deliveryDetails = { 
    service: 'Нова Пошта', 
    city, 
    warehouse 
  };
  
  // Перевіряємо обов'язкові поля
  if (!name || !phone || !email) {
    showNotification('Заповніть всі обов\'язкові поля', 'error');
    return;
  }
  
  // Перевіряємо, що кошик не порожній
  if (Object.keys(cart).length === 0) {
    showNotification('Кошик порожній', 'error');
    return;
  }
  
  // Створюємо об'єкт замовлення
  const order = {
    userId: currentUser.uid,
    userName: name,
    userPhone: cleanPhone,
    userEmail: email,
    items: {...cart},
    total: calculateCartTotal(),
    delivery: deliveryDetails,
    paymentMethod,
    status: 'new',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  // Зберігаємо замовлення в Firestore
  db.collection("orders").add(order)
    .then((docRef) => {
      // Очищаємо кошик
      cart = {};
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      updateCartCount();
      
      showNotification(`Замовлення успішно оформлено. Номер вашого замовлення: ${docRef.id}`);
      closeModal();
      showOrderConfirmation(docRef.id, order);
    })
    .catch(error => {
      console.error("Помилка оформлення замовлення: ", error);
      showNotification("Помилка оформлення замовлення", "error");
    });
}

// Переключення деталей доставки
function toggleDeliveryDetails(method) {
  // Приховуємо всі блоки з деталями
  document.querySelectorAll('.delivery-details').forEach(detail => {
    detail.classList.remove('active');
  });
  
  // Показуємо потрібний блок
  document.getElementById(`${method}-details`).classList.add('active');
}

// Генерація підсумку замовлення
function generateOrderSummary() {
  let summaryHTML = '';
  
  for (const [productId, quantity] of Object.entries(cart)) {
    const product = products.find(p => p.id === productId);
    if (product) {
      summaryHTML += `
        <div class="order-item">
          <span>${product.title} x${quantity}</span>
          <span>${formatPrice(product.price * quantity)} ₴</span>
        </div>
      `;
    }
  }
  
  return summaryHTML;
}

// Розрахунок загальної вартості кошика
function calculateCartTotal() {
  return Object.entries(cart).reduce((sum, [productId, quantity]) => {
    const product = products.find(p => p.id === productId);
    return sum + (product ? product.price * quantity : 0);
  }, 0);
}

// Показ підтвердження замовлення
function showOrderConfirmation(orderId, order) {
  const modalContent = document.getElementById("modal-content");
  
  modalContent.innerHTML = `
    <div class="order-confirmation">
      <div class="confirmation-header">
        <i class="fas fa-check-circle"></i>
        <h3>Замовлення успішно оформлено!</h3>
      </div>
      <div class="confirmation-details">
        <p><strong>Номер замовлення:</strong> ${orderId}</p>
        <p><strong>Ім'я:</strong> ${order.userName}</p>
        <p><strong>Телефон:</strong> ${order.userPhone}</p>
        <p><strong>Email:</strong> ${order.userEmail}</p>
        <p><strong>Спосіб доставки:</strong> ${order.delivery.service}</p>
        <div class="delivery-notice">
          <i class="fas fa-info-circle"></i>
          <p>Доставка здійснюється за тарифами перевізника. Вартість доставки розраховується окремо та оплачується при отриманні замовлення.</p>
        </div>
        <p><strong>Місто:</strong> ${order.delivery.city}</p>
        <p><strong>Відділення:</strong> ${order.delivery.warehouse}</p>
        <p><strong>Спосіб оплати:</strong> ${order.paymentMethod === 'cash' ? 'Готівкою при отриманні' : 'Онлайн-оплата карткою'}</p>
        <p><strong>Сума товарів:</strong> ${formatPrice(order.total)} ₴</p>
      </div>
      <div class="confirmation-actions">
        <button class="btn btn-detail" onclick="closeModal()">Продовжити покупки</button>
        <button class="btn" onclick="viewOrders()">Мої замовлення</button>
      </div>
    </div>
  `;
  
  openModal();
}

// Відкриття модального вікна
function openModal() {
  document.getElementById("modal").classList.add("active");
}

// Закриття модального вікна
function closeModal() {
  document.getElementById("modal").classList.remove("active");
}

// Відкриття модального вікна авторизації
function openAuthModal() {
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Вхід в систему</h3>
    <div class="auth-tabs">
      <div class="auth-tab active" onclick="switchAuthTab('login')">Вхід</div>
      <div class="auth-tab" onclick="switchAuthTab('register')">Реєстрація</div>
      <div class="auth-tab" onclick="switchAuthTab('admin')">Адміністратор</div>
    </div>
    <form id="login-form" onsubmit="login(event)">
      <div class="form-group">
        <label>Email</label>
        <input type="email" required>
      </div>
      <div class="form-group">
        <label>Пароль</label>
        <input type="password" required>
      </div>
      <button type="submit" class="btn btn-detail">Увійти</button>
    </form>
    <form id="register-form" style="display:none;" onsubmit="register(event)">
      <div class="form-group">
        <label>Ім'я</label>
        <input type="text" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" required>
      </div>
      <div class="form-group">
        <label>Пароль</label>
        <input type="password" required minlength="6">
      </div>
      <button type="submit" class="btn btn-detail">Зареєструватися</button>
    </form>
    <div id="admin-auth-form" style="display:none;">
      <p>Для доступу до панелі адміністратора введіть пароль:</p>
      <div class="form-group">
        <label>Пароль адміністратора</label>
        <input type="password" id="admin-password" required>
      </div>
      <button class="btn btn-admin" onclick="verifyAdminPassword()">Отримати права адміністратора</button>
    </div>
  `;
  
  openModal();
}

// Переключення вкладок авторизації
function switchAuthTab(tab) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const adminForm = document.getElementById("admin-auth-form");
  const tabs = document.querySelectorAll(".auth-tab");
  
  tabs.forEach(t => t.classList.remove('active'));
  
  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    adminForm.style.display = 'none';
    tabs[0].classList.add('active');
  } else if (tab === 'register') {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    adminForm.style.display = 'none';
    tabs[1].classList.add('active');
  } else if (tab === 'admin') {
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    adminForm.style.display = 'block';
    tabs[2].classList.add('active');
  }
}

// Вхід в систему
function login(event) {
  event.preventDefault();
  const email = event.target.querySelector('input[type="email"]').value;
  const password = event.target.querySelector('input[type="password"]').value;
  
  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      showNotification("Вхід виконано успішно");
      closeModal();
    })
    .catch(error => {
      let message = "Помилка входу";
      switch (error.code) {
        case 'auth/user-not-found':
          message = "Користувач не знайдений";
          break;
        case 'auth/wrong-password':
          message = "Невірний пароль";
          break;
      }
      showNotification(message, "error");
    });
}

// Реєстрація
function register(event) {
  event.preventDefault();
  const name = event.target.querySelector('input[type="text"]').value;
  const email = event.target.querySelector('input[type="email"]').value;
  const password = event.target.querySelector('input[type="password"]').value;
  
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      // Оновлюємо профіль користувача
      return userCredential.user.updateProfile({
        displayName: name
      });
    })
    .then(() => {
      showNotification("Реєстрація виконана успішно");
      closeModal();
    })
    .catch(error => {
      console.error("Помилка реєстрації: ", error);
      showNotification("Помилка реєстрації: " + error.message, "error");
    });
}

// Функція перевірки пароля адміністратора
function verifyAdminPassword() {
  const password = document.getElementById("admin-password").value;
  if (password === ADMIN_PASSWORD) {
    if (!currentUser) {
      showNotification("Спочатку увійдіть в систему", "error");
      switchAuthTab('login');
      return;
    }
    
    // Зберігаємо користувача як адміністратора
    const admins = JSON.parse(localStorage.getItem(ADMINS_STORAGE_KEY) || '{}');
    admins[currentUser.uid] = true;
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(admins));
    
    document.getElementById("admin-panel").style.display = "block";
    adminMode = true;
    showNotification("Права адміністратора отримані");
    closeModal();
    
    // Завантажуємо замовлення для адмін-панелі
    loadAdminOrders();
    
    // Показуємо лічильник переглядів
    document.getElementById("page-views-container").style.display = "block";
    setupPageCounter();
  } else {
    showNotification("Невірний пароль адміністратора", "error");
  }
}

// Функція для введення пароля адміністратора
function promptAdminPassword() {
  const password = prompt("Введіть пароль адміністратора:");
  if (password === ADMIN_PASSWORD) {
    if (!currentUser) {
      showNotification("Спочатку увійдіть в систему", "error");
      openAuthModal();
      return;
    }
    
    // Зберігаємо користувача як адміністратора
    const admins = JSON.parse(localStorage.getItem(ADMINS_STORAGE_KEY) || '{}');
    admins[currentUser.uid] = true;
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(admins));
    
    document.getElementById("admin-panel").style.display = "block";
    adminMode = true;
    showNotification("Права адміністратора отримані");
    
    // Завантажуємо замовлення для адмін-панелі
    loadAdminOrders();
    
    // Показуємо лічильник переглядів
    document.getElementById("page-views-container").style.display = "block";
    setupPageCounter();
  } else if (password) {
    showNotification("Невірний пароль адміністратора", "error");
  }
}

// Перевірка статусу адміністратора
function checkAdminStatus(userId) {
  db.collection("admins").doc(userId).get()
    .then((doc) => {
      if (doc.exists) {
        document.getElementById("admin-panel").style.display = "block";
        adminMode = true;
        loadAdminOrders();
        
        // Показуємо лічильник переглядів
        document.getElementById("page-views-container").style.display = "block";
        setupPageCounter();
      }
    })
    .catch((error) => {
      console.error("Помилка перевірки прав адміністратора: ", error);
    });
}

// Вихід з системи
function logout() {
  // Не видаляємо права адміністратора при виході, щоб не вводити пароль кожного разу
  auth.signOut()
    .then(() => {
      showNotification("Вихід виконано успішно");
    })
    .catch(error => {
      console.error("Помилка виходу: ", error);
      showNotification("Помилка виходу", "error");
    });
}

// Переключення вкладок в адмін-панелі
function switchTab(tabId) {
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");
  
  tabs.forEach(tab => tab.classList.remove("active"));
  tabContents.forEach(content => content.classList.remove("active"));
  
  document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`).classList.add("active");
  document.getElementById(tabId).classList.add("active");
  
  // Якщо переключилися на вкладку товарів, завантажуємо їх
  if (tabId === 'products-tab') {
    loadAdminProducts();
  }
  
  // Якщо переключилися на вкладку замовлень, завантажуємо їх
  if (tabId === 'orders-tab') {
    loadAdminOrders();
  }
}

// ===== ЗАВАНТАЖЕННЯ ЗАМОВЛЕНЬ В АДМІН-ПАНЕЛІ =====
function loadAdminOrders() {
  const ordersList = document.getElementById("admin-orders-list");
  ordersList.innerHTML = '<p>Завантаження замовлень...</p>';
  
  // Слухаємо оновлення в реальному часі
  db.collection("orders")
    .orderBy("createdAt", "desc")
    .onSnapshot((querySnapshot) => {
      if (querySnapshot.empty) {
        ordersList.innerHTML = '<p>Замовлень немає</p>';
        return;
      }
      
      ordersList.innerHTML = '';
      
      querySnapshot.forEach((doc) => {
        const order = { id: doc.id, ...doc.data() };
        const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('uk-UA') : 'Дата не вказана';
        
        // Визначаємо статус замовлення
        let statusClass = 'status-new';
        let statusText = 'Новий';
        
        if (order.status === 'processing') {
          statusClass = 'status-processing';
          statusText = 'В обробці';
        } else if (order.status === 'shipped') {
          statusClass = 'status-shipped';
          statusText = 'Відправлено';
        } else if (order.status === 'delivered') {
          statusClass = 'status-delivered';
          statusText = 'Доставлено';
        } else if (order.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Скасовано';
        }
        
        const orderElement = document.createElement('div');
        orderElement.className = 'admin-order-item';
        orderElement.innerHTML = `
          <div class="order-header">
            <h4>Замовлення #${order.id}</h4>
            <span class="order-date">${orderDate}</span>
          </div>
          <div class="order-info">
            <p><strong>Клієнт:</strong> ${order.userName} (${order.userEmail}, ${order.userPhone})</p>
            <p><strong>Сума:</strong> ${formatPrice(order.total)} ₴</p>
            <p><strong>Доставка:</strong> ${order.delivery.service}</p>
            <p><strong>Статус:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
          </div>
          <div class="admin-order-actions">
            <button class="btn btn-detail" onclick="viewOrderDetails('${order.id}')">Деталі</button>
            <select onchange="changeOrderStatus('${order.id}', this.value)">
              <option value="new" ${order.status === 'new' ? 'selected' : ''}>Новий</option>
              <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обробці</option>
              <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Відправлено</option>
              <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Доставлено</option>
              <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Скасовано</option>
            </select>
            <button class="btn btn-danger" onclick="deleteOrder('${order.id}')">Видалити</button>
          </div>
        `;
        
        ordersList.appendChild(orderElement);
      });
    }, (error) => {
      console.error("Помилка завантаження замовлень: ", error);
      ordersList.innerHTML = '<p>Помилка завантаження замовлень</p>';
    });
}

// ===== ЗМІНА СТАТУСУ ЗАМОВЛЕННЯ =====
function changeOrderStatus(orderId, status) {
  db.collection("orders").doc(orderId).update({
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  })
  .then(() => {
    showNotification("Статус замовлення оновлено");
  })
  .catch((error) => {
    console.error("Помилка оновлення статусу замовлення: ", error);
    showNotification("Помилка оновлення статусу замовлення", "error");
  });
}

// ===== ВИДАЛЕННЯ ЗАМОВЛЕННЯ =====
function deleteOrder(orderId) {
  if (confirm("Ви впевнені, що хочете видалити це замовлення? Цю дію не можна скасувати.")) {
    db.collection("orders").doc(orderId).delete()
      .then(() => {
        showNotification("Замовлення успішно видалено");
      })
      .catch((error) => {
        console.error("Помилка видалення замовлення: ", error);
        showNotification("Помилка видалення замовлення", "error");
      });
  }
}

// ===== ПЕРЕГЛЯД ДЕТАЛЕЙ ЗАМОВЛЕННЯ =====
function viewOrderDetails(orderId) {
  db.collection("orders").doc(orderId).get()
    .then((doc) => {
      if (!doc.exists) {
        showNotification("Замовлення не знайдено", "error");
        return;
      }
      
      const order = { id: doc.id, ...doc.data() };
      const modalContent = document.getElementById("modal-content");
      
      let itemsHTML = '';
      for (const [productId, quantity] of Object.entries(order.items)) {
        const product = products.find(p => p.id === productId);
        if (product) {
          itemsHTML += `
            <div class="cart-item">
              <img src="${product.image || 'https://via.placeholder.com/80x80?text=No+Image'}" alt="${product.title}" class="cart-item-image">
              <div class="cart-item-details">
                <h4 class="cart-item-title">${product.title}</h4>
                <div class="cart-item-price">${formatPrice(product.price)} ₴ x ${quantity} = ${formatPrice(product.price * quantity)} ₴</div>
              </div>
            </div>
          `;
        }
      }
      
      // Форматуємо дату
      const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('uk-UA') : 'Дата не вказана';
      const updatedDate = order.updatedAt ? order.updatedAt.toDate().toLocaleString('uk-UA') : 'Дата не вказана';
      
      modalContent.innerHTML = `
        <h3>Деталі замовлення #${order.id}</h3>
        <div class="order-details">
          <div class="customer-info">
            <h4>Інформація про клієнта</h4>
            <p><strong>Ім'я:</strong> ${order.userName}</p>
            <p><strong>Email:</strong> ${order.userEmail}</p>
            <p><strong>Телефон:</strong> ${order.userPhone}</p>
          </div>
          
          <div class="order-meta">
            <h4>Інформація про замовлення</h4>
            <p><strong>Дата створення:</strong> ${orderDate}</p>
            <p><strong>Дата оновлення:</strong> ${updatedDate}</p>
            <p><strong>Спосіб оплати:</strong> ${order.paymentMethod === 'cash' ? 'Готівкою при отриманні' : 'Онлайн-оплата карткою'}</p>
            <p><strong>Статус:</strong> ${order.status}</p>
          </div>
          
          <div class="delivery-info">
            <h4>Доставка</h4>
            <p><strong>Служба:</strong> ${order.delivery.service}</p>
            ${order.delivery.city ? `<p><strong>Місто:</strong> ${order.delivery.city}</p>` : ''}
            ${order.delivery.warehouse ? `<p><strong>Відділення:</strong> ${order.delivery.warehouse}</p>` : ''}
            ${order.delivery.address ? `<p><strong>Адреса:</strong> ${order.delivery.address}</p>` : ''}
          </div>
          
          <div class="order-items">
            <h4>Товари</h4>
            ${itemsHTML}
          </div>
          
          <div class="order-total">
            <h4>Разом: ${formatPrice(order.total)} ₴</h4>
          </div>
        </div>
      `;
      
      openModal();
    })
    .catch((error) => {
      console.error("Помилка завантаження деталей замовлення: ", error);
      showNotification("Помилка завантаження деталей замовлення", "error");
    });
}

// Збереження URL фіду
function saveFeedUrl() {
  const feedUrl = document.getElementById("feed-url").value;
  localStorage.setItem(FEED_URL_KEY, feedUrl);
  showNotification("URL фіду збережено");
}

// Очищення каталогу
function clearCatalog() {
  if (confirm("Ви впевнені, що хочете очистити каталог? Цю дію не можна скасувати.")) {
    showLoadingSkeleton();
    
    // Отримуємо всі товари
    db.collection("products").get()
      .then((querySnapshot) => {
        const batch = db.batch();
        querySnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      })
      .then(() => {
        products = [];
        localStorage.removeItem('products_backup');
        renderProducts();
        renderFeaturedProducts();
        renderCategories();
        renderBrands();
        showNotification("Каталог очищено");
      })
      .catch((error) => {
        console.error("Помилка при очищенні каталогу: ", error);
        showNotification("Помилка при очищенні каталогу", "error");
      });
  }
}

// Експорт в JSON
function exportJSON() {
  const dataStr = JSON.stringify(products, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'products.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
  
  showNotification("Дані експортовано в JSON");
}

// Функція відкриття модального вікна додавання товару
function openAddProductModal() {
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Додати новий товар</h3>
    <form onsubmit="saveNewProduct(event)">
      <div class="form-group">
        <label>Назва товару</label>
        <input type="text" id="product-title" required>
      </div>
      <div class="form-group">
        <label>Опис</label>
        <textarea id="product-description" rows="3"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ціна, ₴</label>
          <input type="number" id="product-price" min="0" step="0.01" required>
        </div>
        <div class="form-group">
          <label>Стара ціна, ₴</label>
          <input type="number" id="product-old-price" min="0" step="0.01">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Категорія</label>
          <input type="text" id="product-category" required>
        </div>
        <div class="form-group">
          <label>Бренд</label>
          <input type="text" id="product-brand" required>
        </div>
      </div>
      <div class="form-group">
        <label>URL зображення</label>
        <input type="url" id="product-image">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>
            <input type="checkbox" id="product-in-stock"> В наявності
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="product-is-new"> Новинка
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Знижка, %</label>
        <input type="number" id="product-discount" min="0" max="100">
      </div>
      <button type="submit" class="btn btn-detail">Зберегти товар</button>
    </form>
  `;
  
  openModal();
}

// Функція збереження нового товару
function saveNewProduct(event) {
  event.preventDefault();
  
  const newProduct = {
    title: document.getElementById('product-title').value,
    description: document.getElementById('product-description').value,
    price: parseFloat(document.getElementById('product-price').value),
    oldPrice: document.getElementById('product-old-price').value ? parseFloat(document.getElementById('product-old-price').value) : null,
    category: document.getElementById('product-category').value,
    brand: document.getElementById('product-brand').value,
    image: document.getElementById('product-image').value || '',
    inStock: document.getElementById('product-in-stock').checked,
    isNew: document.getElementById('product-is-new').checked,
    discount: document.getElementById('product-discount').value ? parseInt(document.getElementById('product-discount').value) : null
  };
  
  saveProduct(newProduct)
    .then(() => {
      closeModal();
      // Переключаємося на вкладку товарів в адмін-панелі
      switchTab('products-tab');
    });
}

// Функція завантаження товарів в адмін-панелі
function loadAdminProducts() {
  const productsList = document.getElementById("admin-products-list");
  productsList.innerHTML = '<p>Завантаження товарів...</p>';
  
  db.collection("products")
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        productsList.innerHTML = '<p>Товарів немає</p>';
        return;
      }
      
      productsList.innerHTML = `
        <div style="margin-bottom: 15px;">
          <input type="text" id="admin-products-search" placeholder="Пошук товарів..." oninput="searchAdminProducts(this.value)" style="padding: 8px; width: 100%; border: 1px solid #ddd; border-radius: var(--border-radius);">
        </div>
        <div class="admin-products-container"></div>
      `;
      
      const productsContainer = productsList.querySelector('.admin-products-container');
      
      querySnapshot.forEach((doc) => {
        const product = { id: doc.id, ...doc.data() };
        const productElement = document.createElement('div');
        productElement.className = 'admin-product-item';
        productElement.style.border = '1px solid #eee';
        productElement.style.padding = '15px';
        productElement.style.marginBottom = '15px';
        productElement.style.borderRadius = '8px';
        
        productElement.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <h4>${product.title}</h4>
              <p>${product.description || 'Опис відсутній'}</p>
              <p><strong>Ціна:</strong> ${formatPrice(product.price)} ₴</p>
              <p><strong>Категорія:</strong> ${product.category}</p>
              <p><strong>Бренд:</strong> ${product.brand}</p>
              <p><strong>Статус:</strong> ${product.inStock ? 'В наявності' : 'Немає в наявності'}</p>
            </div>
            <div>
              <img src="${product.image || 'https://via.placeholder.com/100x100?text=No+Image'}" alt="${product.title}" style="width: 100px; height: 100px; object-fit: cover; border-radius: var(--border-radius);">
            </div>
          </div>
          <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button class="btn btn-detail" onclick="editProduct('${product.id}')">Редагувати</button>
            <button class="btn" style="background: var(--danger); color: white;" onclick="deleteProduct('${product.id}')">Видалити</button>
          </div>
        `;
        
        productsContainer.appendChild(productElement);
      });
    })
    .catch((error) => {
      console.error("Помилка завантаження товарів: ", error);
      productsList.innerHTML = '<p>Помилка завантаження товарів</p>';
    });
}

// Функція пошуку товарів в адмін-панелі
function searchAdminProducts(query) {
  const productItems = document.querySelectorAll('.admin-product-item');
  const searchTerm = query.toLowerCase();
  
  productItems.forEach(item => {
    const title = item.querySelector('h4').textContent.toLowerCase();
    const description = item.querySelector('p').textContent.toLowerCase();
    
    if (title.includes(searchTerm) || description.includes(searchTerm)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

// Функція редагування товару
function editProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Редагувати товар</h3>
    <form onsubmit="updateProduct(event, '${productId}')">
      <div class="form-group">
        <label>Назва товару</label>
        <input type="text" id="edit-product-title" value="${product.title}" required>
      </div>
      <div class="form-group">
        <label>Опис</label>
        <textarea id="edit-product-description" rows="3">${product.description || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ціна, ₴</label>
          <input type="number" id="edit-product-price" value="${product.price}" min="0" step="0.01" required>
        </div>
        <div class="form-group">
          <label>Стара ціна, ₴</label>
          <input type="number" id="edit-product-old-price" value="${product.oldPrice || ''}" min="0" step="0.01">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Категорія</label>
          <input type="text" id="edit-product-category" value="${product.category}" required>
        </div>
        <div class="form-group">
          <label>Бренд</label>
          <input type="text" id="edit-product-brand" value="${product.brand}" required>
        </div>
      </div>
      <div class="form-group">
        <label>URL зображення</label>
        <input type="url" id="edit-product-image" value="${product.image || ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-product-in-stock" ${product.inStock ? 'checked' : ''}> В наявності
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-product-is-new" ${product.isNew ? 'checked' : ''}> Новинка
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Знижка, %</label>
        <input type="number" id="edit-product-discount" value="${product.discount || ''}" min="0" max="100">
      </div>
      <button type="submit" class="btn btn-detail">Зберегти зміни</button>
    </form>
  `;
  
  openModal();
}

// Функція оновлення товару
function updateProduct(event, productId) {
  event.preventDefault();
  
  const updatedProduct = {
    id: productId,
    title: document.getElementById('edit-product-title').value,
    description: document.getElementById('edit-product-description').value,
    price: parseFloat(document.getElementById('edit-product-price').value),
    oldPrice: document.getElementById('edit-product-old-price').value ? parseFloat(document.getElementById('edit-product-old-price').value) : null,
    category: document.getElementById('edit-product-category').value,
    brand: document.getElementById('edit-product-brand').value,
    image: document.getElementById('edit-product-image').value || '',
    inStock: document.getElementById('edit-product-in-stock').checked,
    isNew: document.getElementById('edit-product-is-new').checked,
    discount: document.getElementById('edit-product-discount').value ? parseInt(document.getElementById('edit-product-discount').value) : null
  };
  
  saveProduct(updatedProduct)
    .then(() => {
      closeModal();
      // Оновлюємо список товарів в адмін-панелі
      loadAdminProducts();
    });
}

// Функція видалення товару
function deleteProduct(productId) {
  if (confirm("Ви впевнені, що хочете видалити цей товар? Цю дію не можна скасувати.")) {
    db.collection("products").doc(productId).delete()
      .then(() => {
        showNotification("Товар успішно видалено");
        // Оновлюємо список товарів
        loadAdminProducts();
        // Перезавантажуємо основні продукти
        loadProducts();
      })
      .catch((error) => {
        console.error("Помилка видалення товару: ", error);
        showNotification("Помилка видалення товару", "error");
      });
  }
}

// Функція відкриття профілю користувача
function openProfile() {
  if (!currentUser) {
    showNotification("Спочатку увійдіть в систему", "warning");
    openAuthModal();
    return;
  }
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Профіль користувача</h3>
    <div class="profile-info">
      <div class="form-group">
        <label>Ім'я</label>
        <input type="text" id="profile-name" value="${currentUser.displayName || ''}">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="profile-email" value="${currentUser.email || ''}" disabled>
      </div>
      <div class="form-group">
        <label>Новий пароль</label>
        <input type="password" id="profile-password" placeholder="Залиште порожнім, якщо не хочете змінювати">
      </div>
      <button class="btn btn-detail" onclick="updateProfile()">Зберегти зміни</button>
    </div>
  `;
  
  openModal();
}

// Функція оновлення профілю користувача
function updateProfile() {
  const name = document.getElementById('profile-name').value;
  const password = document.getElementById('profile-password').value;
  
  const updates = {};
  if (name !== currentUser.displayName) {
    updates.displayName = name;
  }
  
  // Оновлюємо профіль
  const promises = [currentUser.updateProfile(updates)];
  
  // Якщо вказано новий пароль, оновлюємо його
  if (password) {
    promises.push(currentUser.updatePassword(password));
  }
  
  Promise.all(promises)
    .then(() => {
      showNotification("Профіль успішно оновлено");
      closeModal();
      // Оновлюємо ім'я користувача в інтерфейсі
      document.getElementById('user-name').textContent = name || currentUser.email;
    })
    .catch((error) => {
      console.error("Помилка оновлення профілю: ", error);
      showNotification("Помилка оновлення профілю: " + error.message, "error");
    });
}

// Функція перегляду замовлень користувача
function viewOrders() {
  if (!currentUser) {
    showNotification("Спочатку увійдіть в систему", "warning");
    openAuthModal();
    return;
  }
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = '<h3>Мої замовлення</h3><p>Завантаження замовлень...</p>';
  
  openModal();
  
  // Завантажуємо замовлення користувача
  db.collection("orders")
    .where("userId", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        modalContent.innerHTML = `
          <h3>Мої замовлення</h3>
          <div class="empty-cart">
            <i class="fas fa-box-open"></i>
            <h3>Замовлень немає</h3>
            <p>Ви ще не здійснювали покупок в нашому магазині</p>
          </div>
        `;
        return;
      }
      
      let ordersHTML = '';
      querySnapshot.forEach((doc) => {
        const order = { id: doc.id, ...doc.data() };
        const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('uk-UA') : 'Дата не вказана';
        
        // Визначаємо статус замовлення
        let statusClass = 'status-new';
        let statusText = 'Новий';
        
        if (order.status === 'processing') {
          statusClass = 'status-processing';
          statusText = 'В обробці';
        } else if (order.status === 'shipped') {
          statusClass = 'status-shipped';
          statusText = 'Відправлено';
        } else if (order.status === 'delivered') {
          statusClass = 'status-delivered';
          statusText = 'Доставлено';
        } else if (order.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Скасовано';
        }
        
        ordersHTML += `
          <div class="order-item" style="border: 1px solid #eee; padding: 15px; margin-bottom: 15px; border-radius: 8px;">
            <h4>Змовлення #${order.id}</h4>
            <p><strong>Дата:</strong> ${orderDate}</p>
            <p><strong>Сума:</strong> ${formatPrice(order.total)} ₴</p>
            <p><strong>Статус:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
            <p><strong>Спосіб доставки:</strong> ${order.delivery.service}</p>
            <button class="btn btn-detail" onclick="viewOrderDetails('${order.id}')">Детальніше</button>
          </div>
        `;
      });
      
      modalContent.innerHTML = `
        <h3>Мої замовлення</h3>
        <div class="user-orders">
          ${ordersHTML}
        </div>
      `;
    })
    .catch((error) => {
      console.error("Помилка завантаження замовлень: ", error);
      modalContent.innerHTML = `
        <h3>Мої замовлення</h3>
        <p>Помилка завантаження замовлень. Будь ласка, спробуйте пізніше.</p>
      `;
    });
}

// Функція для відкриття модального вікна з правилами
function openRules() {
  document.getElementById('rules-modal').style.display = 'block';
}

// Функція для закриття модального вікна з правилами
function closeRulesModal() {
  document.getElementById('rules-modal').style.display = 'none';
}

// Закриття модального вікна при кліку outside content
document.getElementById('rules-modal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeRulesModal();
  }
});

// Ініціалізація додатка після завантаження DOM
document.addEventListener('DOMContentLoaded', initApp);