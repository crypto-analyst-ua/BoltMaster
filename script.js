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

// Константы приложения
const ADMIN_PASSWORD = "12345";
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

// Добавляем новую функцию для загрузки товаров из JSON файла
function loadProductsFromJson() {
  return fetch('products.json')
    .then(response => {
      if (!response.ok) {
        // Пробуем загрузить из локального хранилища
        const backup = localStorage.getItem('products_backup');
        if (backup) {
          return JSON.parse(backup);
        }
        throw new Error('Файл products.json не найден');
      }
      return response.json();
    })
    .then(data => {
      if (Array.isArray(data)) {
        return data;
      } else {
        throw new Error('Неверный формат файла products.json');
      }
    });
}

// Инициализация приложения
function initApp() {
  // Проверяем статус аутентификации
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      document.getElementById('login-btn').style.display = 'none';
      document.getElementById('user-menu').style.display = 'inline-block';
      document.getElementById('admin-access-btn').style.display = 'inline-block';
      document.getElementById('user-name').textContent = user.displayName || user.email;
      
      // Проверяем, является ли пользователь администратором
      checkAdminStatus(user.uid);
    } else {
      currentUser = null;
      document.getElementById('login-btn').style.display = 'inline-block';
      document.getElementById('user-menu').style.display = 'none';
      document.getElementById('admin-access-btn').style.display = 'none';
      document.getElementById("admin-panel").style.display = "none";
      adminMode = false;
    }
  });
  
  // Пытаемся загрузить продукты из Firestore
  loadProducts().catch(error => {
    console.error("Ошибка загрузки из Firestore, пробуем загрузить из JSON:", error);
    
    // Если не удалось загрузить из Firestore, пробуем загрузить из JSON
    loadProductsFromJson()
      .then(jsonProducts => {
        products = jsonProducts;
        updateCartCount();
        renderProducts();
        renderFeaturedProducts();
        renderCategories();
        renderBrands();
        showNotification("Товары загружены из локального файла");
        
        // Сохраняем продукты в localStorage как резервную копию
        localStorage.setItem('products_backup', JSON.stringify(products));
      })
      .catch(jsonError => {
        console.error("Ошибка загрузки из JSON:", jsonError);
        showNotification("Не удалось загрузить товары", "error");
      });
  });
  
  // Загружаем избранное и корзину из localStorage
  const cartData = localStorage.getItem(CART_STORAGE_KEY);
  if(cartData) cart = JSON.parse(cartData);
  
  const favoritesData = localStorage.getItem(FAVORITES_STORAGE_KEY);
  if(favoritesData) favorites = JSON.parse(favoritesData);
  
  // Загружаем настройки вида
  const viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'grid';
  setViewMode(viewMode);
  
  updateCartCount();
  
  // Загружаем сохраненный URL фида
  const feedUrl = localStorage.getItem(FEED_URL_KEY);
  if (feedUrl) {
    document.getElementById("feed-url").value = feedUrl;
  }
  
  // Устанавливаем текущий год в футере
  document.getElementById("year").innerText = new Date().getFullYear();
  
  // Добавляем обработчики событий
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
  
  // Добавляем обработчики для фильтров цены
  document.getElementById('price-min').addEventListener('change', function() {
    currentFilters.minPrice = this.value ? parseInt(this.value) : null;
    applyFilters();
  });
  
  document.getElementById('price-max').addEventListener('change', function() {
    currentFilters.maxPrice = this.value ? parseInt(this.value) : null;
    applyFilters();
  });
}

// Обновляем функцию loadProducts для обработки случая, когда в Firestore нет товаров
function loadProducts() {
  // Проверяем кэш перед загрузкой
  const cachedProducts = localStorage.getItem('products_cache');
  const cacheTime = localStorage.getItem('products_cache_time');
  
  if (cachedProducts && cacheTime && Date.now() - cacheTime < 300000) { // 5 минут
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
        // Если в Firestore нет товаров, пробуем загрузить из localStorage
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
          // Если в localStorage тоже нет, пробуем загрузить из JSON
          return loadProductsFromJson()
            .then(jsonProducts => {
              products = jsonProducts;
              updateCartCount();
              renderProducts();
              renderFeaturedProducts();
              renderCategories();
              renderBrands();
              showNotification("Товары загружены из локального файла");
              
              // Сохраняем продукты в localStorage как резервную копию
              localStorage.setItem('products_backup', JSON.stringify(products));
            });
        }
      } else {
        products = [];
        querySnapshot.forEach((doc) => {
          products.push({ id: doc.id, ...doc.data() });
        });
        
        // Сохраняем в кэш
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
      console.error("Ошибка загрузки продуктов: ", error);
      showNotification("Ошибка загрузки продуктов", "error");
      
      // Пробуем загрузить из localStorage, если Firestore недоступен
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
        // Пробрасываем ошибку дальше для обработки в initApp
        return Promise.reject(error);
      }
    });
}

// ===== ФУНКЦИИ ПАГИНАЦИИ =====

// Функция для изменени страницы в пагинации
function changePage(page) {
  currentPage = page;
  showLoadingSkeleton();
  
  // Используем setTimeout для плавного перехода
  setTimeout(() => {
    renderProducts();
    updatePagination();
    // Прокручиваем страницу вверх для удобства просмотра
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 100);
}

// Обновление отображения пагинации
function updatePagination() {
  const paginationContainer = document.getElementById("pagination");
  if (!paginationContainer) return; // Добавлена проверка
  
  // Рассчитываем общее количество страниц
  let filteredProducts = getFilteredProducts();
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  
  // Если страниц нет или всего одна, скрываем пагинацию
  if (totalPages <= 1) {
    paginationContainer.style.display = 'none';
    return;
  }
  
  paginationContainer.style.display = 'flex';
  
  // Очищаем контейнер пагинации
  paginationContainer.innerHTML = '';
  
  // Добавляем кнопку "Назад"
  const prevButton = document.createElement('button');
  prevButton.innerHTML = '&laquo;';
  prevButton.disabled = currentPage === 1;
  prevButton.onclick = () => changePage(currentPage - 1);
  paginationContainer.appendChild(prevButton);
  
  // Определяем диапазон отображаемых страниц
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  
  // Корректируем startPage, если мы в конце диапазона
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }
  
  // Добавляем кнопки пагинации
  for (let i = startPage; i <= endPage; i++) {
    const button = document.createElement('button');
    button.textContent = i;
    button.classList.toggle('active', i === currentPage);
    button.onclick = () => changePage(i);
    paginationContainer.appendChild(button);
  }
  
  // Добавляем кнопку "Вперед"
  const nextButton = document.createElement('button');
  nextButton.innerHTML = '&raquo;';
  nextButton.disabled = currentPage === totalPages;
  nextButton.onclick = () => changePage(currentPage + 1);
  paginationContainer.appendChild(nextButton);
}

// Получение отфильтрованных продуктов (вспомогательная функция)
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
  
  // Применяем сортировку
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
      // По умолчанию - без сортировки
      break;
  }
  
  return filteredProducts;
}

// ===== КОНЕЦ ФУНКЦИЙ ПАГИНАЦИИ =====

// Функция для загрузки XML-фида
async function loadFromFeed() {
  const messageElement = document.getElementById("feed-message");
  messageElement.textContent = "Загрузка данных...";
  
  // Получаем URL из сохраненных настроек
  const feedUrl = localStorage.getItem(FEED_URL_KEY) || document.getElementById("feed-url").value;
  
  if (!feedUrl) {
    messageElement.textContent = "Введите URL фида";
    showNotification("Введите URL фида для загрузки");
    return;
  }
  
  // Сохраняем URL, если он был введен в поле
  if (document.getElementById("feed-url").value) {
    localStorage.setItem(FEED_URL_KEY, document.getElementById("feed-url").value);
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
      const brand = getValue("vendor") || getValue("brand") || "Неизвестно";
      
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
        image: image, // Используем оригинальный URL изображения
        category,
        brand,
        fromFeed: true,
        inStock: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    if (items.length === 0) {
      throw new Error("Не найдено товаров в фиде");
    }
    
    // Сохраняем товары в Firestore
    const batch = db.batch();
    const productsRef = db.collection("products");
    
    for (const item of items) {
      const productRef = productsRef.doc(item.id);
      batch.set(productRef, item, { merge: true });
    }
    
    await batch.commit();
    
    // Сохраняем время последнего обновления
    localStorage.setItem(FEED_UPDATE_TIME_KEY, new Date().getTime());
    
    messageElement.textContent = `Загружено ${items.length} товаров`;
    showNotification("Данные успешно загружены из фида");
    
  } catch (error) {
    console.error("Ошибка загрузки фида:", error);
    messageElement.textContent = `Ошибка: ${error.message}`;
    showNotification("Ошибка загрузки данных из фида", "error");
  }
}

// Сохранение продуктов в Firestore
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
      showNotification("Товар успешно сохранен");
      loadProducts(); // Перезагружаем список товаров
      return productData.id;
    })
    .catch((error) => {
      console.error("Ошибка сохранения товара: ", error);
      showNotification("Ошибка сохранения товара", "error");
      
      // Сохраняем в localStorage как запасной вариант
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

// Генерация ID для нового товара
function generateId() {
  return 'product-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Показать скелетон загрузки
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

// Рендеринг продуктов
function renderProducts() {
  const grid = document.getElementById("product-grid");
  if (!grid) return; // Защита от отсутствия элемента
  
  grid.innerHTML = '';
  
  // Получаем отфильтрованные продукты
  let filteredProducts = getFilteredProducts();
  
  // Обновляем заголовок и счетчик
  document.getElementById('products-title').textContent = showingFavorites ? 'Избранные товары' : 'Все товары';
  document.getElementById('products-count').textContent = `Найдено: ${filteredProducts.length}`;
  
  // Применяем пагинацию
  const startIndex = (currentPage - 1) * productsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + productsPerPage);
  
  // Рендерим продукты
  if (paginatedProducts.length === 0) {
    grid.innerHTML = `
      <div class="empty-cart">
        <i class="fas fa-search"></i>
        <h3>Товары не найдены</h3>
        <p>Попробуйте изменить параметры фильтрации</p>
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
    
    // Проверяем, добавлен ли товар в избранное
    const isFavorite = favorites[product.id];
    
    card.innerHTML = `
      ${product.discount ? `<div class="card-discount">-${product.discount}%</div>` : ''}
      ${product.isNew ? '<div class="card-badge">Новинка</div>' : ''}
      <img src="${product.image || 'https://via.placeholder.com/300x200?text=No+Image'}" alt="${product.title}">
      <h3>${product.title}</h3>
      <p>${product.description || 'Описание отсутствует'}</p>
      <div class="price-container">
        <span class="price">${formatPrice(product.price)} ₴</span>
        ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)} ₴</span>` : ''}
      </div>
      <div class="rating">
        <i class="fas fa-star"></i>
        <i class="fas fa-star"></i>
        <i class="fas fa-star"></i>
        <i class="fas fa-star"></i>
        <i class="fas fa-star-half-alt"></i>
        <span>(12)</span>
      </div>
      <div class="card-actions">
        <button class="btn btn-buy" onclick="addToCart('${product.id}')">
          <i class="fas fa-shopping-cart"></i> Купить
        </button>
        <button class="btn btn-detail" onclick="showProductDetail('${product.id}')">
          <i class="fas fa-info"></i> Подробнее
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

// Рендеринг избранных товаров
function renderFeaturedProducts() {
  const featuredContainer = document.getElementById("featured-products");
  featuredContainer.innerHTML = '';
  
  // Берем первые 5 товаров
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

// Рендеринг категории
function renderCategories() {
  const categorySelect = document.getElementById("category");
  
  // Очищаем все опции кроме первой
  while (categorySelect.options.length > 1) {
    categorySelect.remove(1);
  }
  
  // Получаем уникальные категории
  const categories = [...new Set(products.map(product => product.category))].filter(Boolean);
  
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });
}

// Рендеринг брендов
function renderBrands() {
  const brandSelect = document.getElementById("brand");
  
  // Очищаем все опции кроме первой
  while (brandSelect.options.length > 1) {
    brandSelect.remove(1);
  }
  
  // Получаем уникальные бренды
  const brands = [...new Set(products.map(product => product.brand))].filter(Boolean);
  
  brands.forEach(brand => {
    const option = document.createElement("option");
    option.value = brand;
    option.textContent = brand;
    brandSelect.appendChild(option);
  });
}

// Форматирование цены
function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU').format(price);
}

// Показать уведомление
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

// Добавление товара в корзину
function addToCart(productId) {
  if (!cart[productId]) {
    cart[productId] = 0;
  }
  cart[productId]++;
  
  // Сохраняем корзину в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  showNotification("Товар добавлен в корзину");
}

// Обновление счетчика корзины
function updateCartCount() {
  const count = Object.values(cart).reduce((total, qty) => total + qty, 0);
  document.getElementById("cart-count").textContent = count;
}

// Добавление/удаление из избранного
function toggleFavorite(productId) {
  if (favorites[productId]) {
    delete favorites[productId];
  } else {
    favorites[productId] = true;
  }
  
  // Сохраняем избранное в localStorage
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  
  // Перерисовываем продукты, если находимся в режиме избранного
  if (showingFavorites) {
    renderProducts();
  } else {
    // Иначе просто обновляем иконку сердца у товара
    const heartIcon = document.querySelector(`button[onclick="toggleFavorite('${productId}')"] i`);
    if (heartIcon) {
      heartIcon.className = favorites[productId] ? 'fas fa-heart' : 'far fa-heart';
      heartIcon.parentElement.className = `btn-favorite ${favorites[productId] ? 'active' : ''}`;
    }
  }
  
  showNotification(favorites[productId] ? "Добавлено в избранное" : "Удалено из избранное");
}

// Переключение режима отображения избранного
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

// Применение фильтров
function applyFilters() {
  // Получаем значения цены
  const minPrice = document.getElementById("price-min").value ? parseInt(document.getElementById("price-min").value) : null;
  const maxPrice = document.getElementById("price-max").value ? parseInt(document.getElementById("price-max").value) : null;
  
  // Обновляем фильтры
  currentFilters.minPrice = minPrice;
  currentFilters.maxPrice = maxPrice;
  currentFilters.category = document.getElementById("category").value;
  currentFilters.brand = document.getElementById("brand").value;
  currentFilters.availability = document.getElementById("availability").value;
  currentFilters.sort = document.getElementById("sort").value;
  
  currentPage = 1;
  renderProducts();
  
  // Обновляем счетчик товаров
  const filteredProducts = getFilteredProducts();
  document.getElementById('products-count').textContent = `Найдено: ${filteredProducts.length}`;
}

// Сброс фильтров
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

// Установка режима просмотра
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

// Показать детали товара
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
          <div><i class="fas fa-box"></i> ${product.inStock ? 'В наличии' : 'Нет в наличии'}</div>
          <div><i class="fas fa-truck"></i> Доставка за 1-2 дня</div>
          <div><i class="fas fa-shield-alt"></i> Гарантия 12 месяцев</div>
        </div>
        <div class="product-description">
          <h4>Описание</h4>
          <p>${product.description || 'Описание отсутствует'}</p>
        </div>
        <div class="quantity-control">
          <button class="quantity-btn" onclick="changeQuantity(-1)">-</button>
          <input type="number" class="quantity-input" id="product-quantity" value="1" min="1">
          <button class="quantity-btn" onclick="changeQuantity(1)">+</button>
        </div>
        <div class="detail-actions">
          <button class="btn btn-buy" onclick="addToCartWithQuantity('${product.id}')">
            <i class="fas fa-shopping-cart"></i> Добавить в корзину
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

// Добавление товара в корзину с указанным количеством
function addToCartWithQuantity(productId) {
  const quantity = parseInt(document.getElementById("product-quantity").value) || 1;
  
  if (!cart[productId]) {
    cart[productId] = 0;
  }
  cart[productId] += quantity;
  
  // Сохраняем корзину в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  showNotification("Товар добавлен в корзину");
  closeModal();
}

// Изменение количества товара
function changeQuantity(delta) {
  const input = document.getElementById("product-quantity");
  let value = parseInt(input.value) || 1;
  value += delta;
  
  if (value < 1) value = 1;
  
  input.value = value;
}

// Открытие корзины
function openCart() {
  const modalContent = document.getElementById("modal-content");
  
  if (Object.keys(cart).length === 0) {
    modalContent.innerHTML = `
      <h3>Корзина</h3>
      <div class="empty-cart">
        <i class="fas fa-shopping-cart"></i>
        <h3>Корзина пуста</h3>
        <p>Добавьте товары из каталога</p>
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
      <h3>Корзина</h3>
      <div class="cart-items">
        ${cartItemsHTML}
      </div>
      <div class="cart-footer">
        <div class="cart-total">Итого: ${formatPrice(total)} ₴</div>
        <button class="btn btn-buy" onclick="checkout()">Оформить заказ</button>
      </div>
    `;
  }
  
  openModal();
}

// Изменение количества товара в корзине
function changeCartQuantity(productId, delta) {
  if (!cart[productId] && delta < 1) return; // Защита от отрицательного количества
  
  cart[productId] += delta;
  
  if (cart[productId] < 1) {
    delete cart[productId];
  }
  
  // Сохраняем корзину в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  openCart(); // Перерисовываем корзину
}

// Удаление товара из корзины
function removeFromCart(productId) {
  delete cart[productId];
  
  // Сохраняем корзину в localStorage
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  
  updateCartCount();
  openCart(); // Перерисовываем корзину
}

// Оформление заказа
function checkout() {
  if (!currentUser) {
    closeModal();
    openAuthModal();
    showNotification("Для оформления заказа необходимо авторизоваться", "warning");
    return;
  }
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Оформление заказа</h3>
    <form class="checkout-form" onsubmit="placeOrder(event)">
      <div class="form-row">
        <div class="form-group">
          <label>Имя и фамилия*</label>
          <input type="text" id="order-name" required value="${currentUser.displayName || ''}">
        </div>
        <div class="form-group">
          <label>Телефон*</label>
          <input type="tel" id="order-phone" required placeholder="+38 (0__) ___ __ __">
        </div>
      </div>
      <div class="form-group">
        <label>Email*</label>
        <input type="email" id="order-email" required value="${currentUser.email || ''}">
      </div>
      
      <div class="delivery-section">
        <h4>Способ доставки</h4>
        <div class="delivery-options">
          <label class="delivery-option">
            <input type="radio" name="delivery" value="nova-poshta" checked onchange="toggleDeliveryDetails('nova-poshta')">
            <span>Новая Почта</span>
          </label>
          <label class="delivery-option">
            <input type="radio" name="delivery" value="courier" onchange="toggleDeliveryDetails('courier')">
            <span>Курьерская доставка</span>
          </label>
        </div>
        
        <div id="nova-poshta-details" class="delivery-details active">
          <div class="form-group">
            <label>Город*</label>
            <input type="text" id="np-city" required placeholder="Введите ваш город">
          </div>
          <div class="form-group">
            <label>Отделение Новой Почты*</label>
            <input type="text" id="np-warehouse" required placeholder="Номер отделения">
          </div>
        </div>
        
        <div id="courier-details" class="delivery-details">
          <div class="form-group">
            <label>Адрес доставки*</label>
            <textarea id="courier-address" required placeholder="Улица, дом, квартира"></textarea>
          </div>
        </div>
      </div>
      
      <div class="payment-section">
        <h4>Способ оплаты</h4>
        <div class="payment-options">
          <label class="payment-option">
            <input type="radio" name="payment" value="cash" checked>
            <span>Наличными при получении</span>
          </label>
          <label class="payment-option">
            <input type="radio" name="payment" value="card">
            <span>Онлайн-оплата картой</span>
          </label>
        </div>
      </div>
      
      <div class="order-summary">
        <h4>Ваш заказ</h4>
        <div class="order-items">
          ${generateOrderSummary()}
        </div>
        <div class="order-total">
          <div class="total-line">
            <span>Сумма заказа:</span>
            <span>${formatPrice(calculateCartTotal())} ₴</span>
          </div>
          <div class="total-line">
            <span>Доставка:</span>
            <span>Согласно тарифам перевозчика</span>
          </div>
          <div class="total-line final-total">
            <span>Итого:</span>
            <span>${formatPrice(calculateCartTotal())} ₴</span>
          </div>
        </div>
      </div>
      
      <button type="submit" class="btn btn-buy">Подтвердить заказ</button>
    </form>
  `;
  
  openModal();
}

// Переключение деталей доставки
function toggleDeliveryDetails(method) {
  // Скрываем все блоки с деталями
  document.querySelectorAll('.delivery-details').forEach(detail => {
    detail.classList.remove('active');
  });
  
  // Показываем нужный блок
  document.getElementById(`${method}-details`).classList.add('active');
}

// Генерация сводки заказа
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

// Расчет общей стоимости корзины
function calculateCartTotal() {
  return Object.entries(cart).reduce((sum, [productId, quantity]) => {
    const product = products.find(p => p.id === productId);
    return sum + (product ? product.price * quantity : 0);
  }, 0);
}

// Размещение заказа - исправленная версия
function placeOrder(event) {
  event.preventDefault();
  
  // Проверяем, что пользователь авторизован
  if (!currentUser || !currentUser.uid) {
    closeModal();
    openAuthModal();
    showNotification("Для оформления заказа необходимо авторизоваться", "warning");
    return;
  }
  
  // Получаем данные формы
  const name = document.getElementById('order-name').value;
  const phone = document.getElementById('order-phone').value;
  const email = document.getElementById('order-email').value;
  const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
  
  // Получаем выбранный способ доставки
  const deliveryMethod = document.querySelector('input[name="delivery"]:checked').value;
  let deliveryDetails = {};
  
  // Получаем детали доставки в зависимости от выбранного способа
  if (deliveryMethod === 'nova-poshta') {
    const city = document.getElementById('np-city').value;
    const warehouse = document.getElementById('np-warehouse').value;
    
    if (!city || !warehouse) {
      showNotification('Заполните все поля для доставки Новой Почтой', 'error');
      return;
    }
    
    deliveryDetails = {
      service: 'Новая Почта',
      city,
      warehouse
    };
  } else if (deliveryMethod === 'courier') {
    const address = document.getElementById('courier-address').value;
    
    if (!address) {
      showNotification('Введите адрес доставки', 'error');
      return;
    }
    
    deliveryDetails = {
      service: 'Курьер',
      address
    };
  }
  
  // Проверяем обязательные поля
  if (!name || !phone || !email) {
    showNotification('Заполните все обязательные поля', 'error');
    return;
  }
  
  // Создаем объект заказа
  const order = {
    userId: currentUser.uid,
    userName: name,
    userPhone: phone,
    userEmail: email,
    items: {...cart},
    total: calculateCartTotal(),
    delivery: deliveryDetails,
    paymentMethod,
    status: 'new',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  // Сохраняем заказ в Firestore
  db.collection("orders").add(order)
    .then((docRef) => {
      // Очищаем корзину
      cart = {};
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      updateCartCount();
      
      showNotification(`Заказ успешно оформлен. Номер вашего заказа: ${docRef.id}`);
      
      // Закрываем модальное окно
      closeModal();
      
      // Показываем страницу подтверждения заказа
      showOrderConfirmation(docRef.id, order);
    })
    .catch(error => {
      console.error("Ошибка оформления заказа: ", error);
      showNotification("Ошибка оформления заказа: " + error.message, "error");
    });
}

// Функция просмотра заказов пользователя - исправленная версия
function viewOrders() {
  if (!currentUser) {
    showNotification("Сначала войдите в систему", "warning");
    openAuthModal();
    return;
  }
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = '<h3>Мои заказы</h3><p>Загрузка заказов...</p>';
  
  openModal();
  
  // Загружаем заказы пользователя
  db.collection("orders")
    .where("userId", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        modalContent.innerHTML = `
          <h3>Мои заказы</h3>
          <div class="empty-cart">
            <i class="fas fa-box-open"></i>
            <h3>Заказов нет</h3>
            <p>Вы еще не совершали покупок в нашем магазине</p>
          </div>
        `;
        return;
      }
      
      let ordersHTML = '';
      querySnapshot.forEach((doc) => {
        const order = { id: doc.id, ...doc.data() };
        const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('ru-RU') : 'Дата не указана';
        
        // Определяем статус заказа
        let statusClass = 'status-new';
        let statusText = 'Новый';
        
        if (order.status === 'processing') {
          statusClass = 'status-processing';
          statusText = 'В обработке';
        } else if (order.status === 'shipped') {
          statusClass = 'status-shipped';
          statusText = 'Отправлен';
        } else if (order.status === 'delivered') {
          statusClass = 'status-delivered';
          statusText = 'Доставлен';
        } else if (order.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Отменен';
        }
        
        ordersHTML += `
          <div class="order-item" style="border: 1px solid #eee; padding: 15px; margin-bottom: 15px; border-radius: 8px;">
            <h4>Заказ #${order.id}</h4>
            <p><strong>Дата:</strong> ${orderDate}</p>
            <p><strong>Сумма:</strong> ${formatPrice(order.total)} ₴</p>
            <p><strong>Статус:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
            <p><strong>Способ доставки:</strong> ${order.delivery.service}</p>
            <button class="btn btn-detail" onclick="viewOrderDetails('${order.id}')">Подробнее</button>
          </div>
        `;
      });
      
      modalContent.innerHTML = `
        <h3>Мои заказы</h3>
        <div class="user-orders">
          ${ordersHTML}
        </div>
      `;
    })
    .catch((error) => {
      console.error("Ошибка загрузки заказов: ", error);
      modalContent.innerHTML = `
        <h3>Мои заказы</h3>
        <p>Ошибка загрузки заказов. Пожалуйста, попробуйте позже.</p>
      `;
    });
}

// Показ подтверждения заказа
function showOrderConfirmation(orderId, order) {
  const modalContent = document.getElementById("modal-content");
  
  modalContent.innerHTML = `
    <div class="order-confirmation">
      <div class="confirmation-header">
        <i class="fas fa-check-circle"></i>
        <h3>Заказ успешно оформлен!</h3>
      </div>
      <div class="confirmation-details">
        <p><strong>Номер заказа:</strong> ${orderId}</p>
        <p><strong>Имя:</strong> ${order.userName}</p>
        <p><strong>Телефон:</strong> ${order.userPhone}</p>
        <p><strong>Email:</strong> ${order.userEmail}</p>
        <p><strong>Способ доставки:</strong> ${order.delivery.service}</p>
        <p><strong>Способ оплаты:</strong> ${order.paymentMethod === 'cash' ? 'Наличными при получении' : 'Онлайн-оплата картой'}</p>
        <p><strong>Общая сумма:</strong> ${formatPrice(order.total)} ₴</p>
      </div>
      <div class="confirmation-actions">
        <button class="btn btn-detail" onclick="closeModal()">Продолжить покупки</button>
        <button class="btn" onclick="viewOrders()">Мои заказы</button>
      </div>
    </div>
  `;
  
  openModal();
}

// Открытие модального окна
function openModal() {
  document.getElementById("modal").classList.add("active");
}

// Закрытие модального окна
function closeModal() {
  document.getElementById("modal").classList.remove("active");
}

// Открытие модального окна авторизации
function openAuthModal() {
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Вход в систему</h3>
    <div class="auth-tabs">
      <div class="auth-tab active" onclick="switchAuthTab('login')">Вход</div>
      <div class="auth-tab" onclick="switchAuthTab('register')">Регистрация</div>
      <div class="auth-tab" onclick="switchAuthTab('admin')">Администратор</div>
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
      <button type="submit" class="btn btn-detail">Войти</button>
    </form>
    <form id="register-form" style="display:none;" onsubmit="register(event)">
      <div class="form-group">
        <label>Имя</label>
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
      <button type="submit" class="btn btn-detail">Зарегистрироваться</button>
    </form>
    <div id="admin-auth-form" style="display:none;">
      <p>Для доступа к панели администратора введите пароль:</p>
      <div class="form-group">
        <label>Пароль администратора</label>
        <input type="password" id="admin-password" required>
      </div>
      <button class="btn btn-admin" onclick="verifyAdminPassword()">Получить права администратора</button>
    </div>
  `;
  
  openModal();
}

// Переключение вкладок авторизации
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

// Вход в систему
function login(event) {
  event.preventDefault();
  const email = event.target.querySelector('input[type="email"]').value;
  const password = event.target.querySelector('input[type="password"]').value;
  
  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      showNotification("Вход выполнен успешно");
      closeModal();
    })
    .catch(error => {
      let message = "Ошибка входа";
      switch (error.code) {
        case 'auth/user-not-found':
          message = "Пользователь не найден";
          break;
        case 'auth/wrong-password':
          message = "Неверный пароль";
          break;
      }
      showNotification(message, "error");
    });
}

// Регистрация
function register(event) {
  event.preventDefault();
  const name = event.target.querySelector('input[type="text"]').value;
  const email = event.target.querySelector('input[type="email"]').value;
  const password = event.target.querySelector('input[type="password"]').value;
  
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      // Обновляем профиль пользователя
      return userCredential.user.updateProfile({
        displayName: name
      });
    })
    .then(() => {
      showNotification("Регистрация выполнена успешно");
      closeModal();
    })
    .catch(error => {
      console.error("Ошибка регистрации: ", error);
      showNotification("Ошибка регистрации: " + error.message, "error");
    });
}

// Функция проверки пароля администратора
function verifyAdminPassword() {
  const password = document.getElementById("admin-password").value;
  if (password === ADMIN_PASSWORD) {
    if (!currentUser) {
      showNotification("Сначала войдите в систему", "error");
      switchAuthTab('login');
      return;
    }
    
    // Сохраняем пользователя как администратора
    const admins = JSON.parse(localStorage.getItem(ADMINS_STORAGE_KEY) || '{}');
    admins[currentUser.uid] = true;
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(admins));
    
    document.getElementById("admin-panel").style.display = "block";
    adminMode = true;
    showNotification("Права администратора получены");
    closeModal();
    
    // Загружаем заказы для админ-панели
    loadAdminOrders();
  } else {
    showNotification("Неверный пароль администратора", "error");
  }
}

// Функция для ввода пароля администратора
function promptAdminPassword() {
  const password = prompt("Введите пароль администратора:");
  if (password === ADMIN_PASSWORD) {
    if (!currentUser) {
      showNotification("Сначала войдите в систему", "error");
      openAuthModal();
      return;
    }
    
    // Сохраняем пользователя как администратора
    const admins = JSON.parse(localStorage.getItem(ADMINS_STORAGE_KEY) || '{}');
    admins[currentUser.uid] = true;
    localStorage.setItem(ADMINS_STORAGE_KEY, JSON.stringify(admins));
    
    document.getElementById("admin-panel").style.display = "block";
    adminMode = true;
    showNotification("Права администратора получены");
    
    // Загружаем заказы для админ-панели
    loadAdminOrders();
  } else if (password) {
    showNotification("Неверный пароль администратора", "error");
  }
}

// Проверка статуса администратора
function checkAdminStatus(userId) {
  db.collection("admins").doc(userId).get()
    .then((doc) => {
      if (doc.exists) {
        document.getElementById("admin-panel").style.display = "block";
        adminMode = true;
        loadAdminOrders();
      }
    })
    .catch((error) => {
      console.error("Ошибка проверки прав администратора: ", error);
    });
}

// Выход из системы
function logout() {
  // Не удаляем права администратора при выходе, чтобы не вводить пароль каждый раз
  auth.signOut()
    .then(() => {
      showNotification("Выход выполнен успешно");
    })
    .catch(error => {
      console.error("Ошибка выхода: ", error);
      showNotification("Ошибка выхода", "error");
    });
}

// Переключение вкладок в админ-панели
function switchTab(tabId) {
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");
  
  tabs.forEach(tab => tab.classList.remove("active"));
  tabContents.forEach(content => content.classList.remove("active"));
  
  document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`).classList.add("active");
  document.getElementById(tabId).classList.add("active");
  
  // Если переключились на вкладку товаров, загружаем их
  if (tabId === 'products-tab') {
    loadAdminProducts();
  }
  
  // Если переключились на вкладку заказов, загружаем их
  if (tabId === 'orders-tab') {
    loadAdminOrders();
  }
}

// Загрузка заказов для админ-панели
function loadAdminOrders() {
  const ordersList = document.getElementById("admin-orders-list");
  ordersList.innerHTML = '<p>Загрузка заказов...</p>';
  
  db.collection("orders")
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        ordersList.innerHTML = '<p>Заказов нет</p>';
        return;
      }
      
      ordersList.innerHTML = '';
      
      querySnapshot.forEach((doc) => {
        const order = { id: doc.id, ...doc.data() };
        const orderElement = document.createElement('div');
        orderElement.className = 'order-item';
        orderElement.style.border = '1px solid #eee';
        orderElement.style.padding = '15px';
        orderElement.style.marginBottom = '15px';
        orderElement.style.borderRadius = '8px';
        
        // Форматируем дату
        const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('ru-RU') : 'Дата не указана';
        
        // Определяем статус заказа
        let statusClass = 'status-new';
        let statusText = 'Новый';
        
        if (order.status === 'processing') {
          statusClass = 'status-processing';
          statusText = 'В обработке';
        } else if (order.status === 'shipped') {
          statusClass = 'status-shipped';
          statusText = 'Отправлен';
        } else if (order.status === 'delivered') {
          statusClass = 'status-delivered';
          statusText = 'Доставлен';
        } else if (order.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Отменен';
        }
        
        orderElement.innerHTML = `
          <h4>Заказ #${order.id}</h4>
          <p><strong>Клиент:</strong> ${order.userName} (${order.userEmail}, ${order.userPhone})</p>
          <p><strong>Дата:</strong> ${orderDate}</p>
          <p><strong>Сумма:</strong> ${formatPrice(order.total)} ₴</p>
          <p><strong>Доставка:</strong> ${order.delivery.service}</p>
          <p><strong>Статус:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
          
          <div class="admin-order-actions">
            <button class="btn btn-detail" onclick="viewOrderDetails('${order.id}')">Детали</button>
            <button class="btn btn-admin" onclick="changeOrderStatus('${order.id}', 'processing')">В обработку</button>
            <button class="btn" onclick="changeOrderStatus('${order.id}', 'shipped')">Отправить</button>
            <button class="btn" style="background: var(--success); color: white;" onclick="changeOrderStatus('${order.id}', 'delivered')">Доставлен</button>
            <button class="btn" style="background: var(--danger); color: white;" onclick="changeOrderStatus('${order.id}', 'cancelled')">Отменить</button>
          </div>
        `;
        
        ordersList.appendChild(orderElement);
      });
    })
    .catch((error) => {
      console.error("Ошибка загрузки заказов: ", error);
      ordersList.innerHTML = '<p>Ошибка загрузки заказов</p>';
    });
}

// Просмотр деталей заказа
function viewOrderDetails(orderId) {
  db.collection("orders").doc(orderId).get()
    .then((doc) => {
      if (!doc.exists) {
        showNotification("Заказ не найден", "error");
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
      
      // Форматируем дату
      const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('ru-RU') : 'Дата не указана';
      const updatedDate = order.updatedAt ? order.updatedAt.toDate().toLocaleString('ru-RU') : 'Дата не указана';
      
      modalContent.innerHTML = `
        <h3>Детали заказа #${order.id}</h3>
        <div class="order-details">
          <p><strong>Клиент:</strong> ${order.userName}</p>
          <p><strong>Email:</strong> ${order.userEmail}</p>
          <p><strong>Телефон:</strong> ${order.userPhone}</p>
          <p><strong>Дата создания:</strong> ${orderDate}</p>
          <p><strong>Дата обновления:</strong> ${updatedDate}</p>
          <p><strong>Способ оплаты:</strong> ${order.paymentMethod === 'cash' ? 'Наличными при получении' : 'Онлайн-оплата картой'}</p>
          
          <h4>Доставка</h4>
          <p><strong>Служба:</strong> ${order.delivery.service}</p>
          ${order.delivery.city ? `<p><strong>Город:</strong> ${order.delivery.city}</p>` : ''}
          ${order.delivery.warehouse ? `<p><strong>Отделение:</strong> ${order.delivery.warehouse}</p>` : ''}
          ${order.delivery.address ? `<p><strong>Адрес:</strong> ${order.delivery.address}</p>` : ''}
          
          <h4>Товары</h4>
          ${itemsHTML}
          
          <div class="cart-total">Итого: ${formatPrice(order.total)} ₴</div>
        </div>
      `;
      
      openModal();
    })
    .catch((error) => {
      console.error("Ошибка загрузки деталей заказа: ", error);
      showNotification("Ошибка загрузки деталей заказа", "error");
    });
}

// Изменение статуса заказа
function changeOrderStatus(orderId, status) {
  const statusMap = {
    'new': 'Новый',
    'processing': 'В обработке',
    'shipped': 'Отправлен',
    'delivered': 'Доставлен',
    'cancelled': 'Отменен'
  };
  
  if (!confirm(`Изменить статус заказа на "${statusMap[status]}"?`)) {
    return;
  }
  
  db.collection("orders").doc(orderId).update({
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  })
  .then(() => {
    showNotification("Статус заказа обновлен");
    loadAdminOrders(); // Перезагружаем список заказов
  })
  .catch((error) => {
    console.error("Ошибка обновления статуса заказа: ", error);
    showNotification("Ошибка обновления статуса заказа", "error");
  });
}

// Сохранение URL фида
function saveFeedUrl() {
  const feedUrl = document.getElementById("feed-url").value;
  localStorage.setItem(FEED_URL_KEY, feedUrl);
  showNotification("URL фида сохранен");
}

// Очистка каталога
function clearCatalog() {
  if (confirm("Вы уверены, что хотите очистить каталог? Это действие нельзя отменить.")) {
    showLoadingSkeleton();
    
    // Получаем все товары
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
        showNotification("Каталог очищен");
      })
      .catch((error) => {
        console.error("Ошибка при очистке каталога: ", error);
        showNotification("Ошибка при очистке каталога", "error");
      });
  }
}

// Экспорт в JSON
function exportJSON() {
  const dataStr = JSON.stringify(products, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = 'products.json';
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
  
  showNotification("Данные экспортированы в JSON");
}

// Функция открытия модального окна добавления товара
function openAddProductModal() {
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Добавить новый товар</h3>
    <form onsubmit="saveNewProduct(event)">
      <div class="form-group">
        <label>Название товара</label>
        <input type="text" id="product-title" required>
      </div>
      <div class="form-group">
        <label>Описание</label>
        <textarea id="product-description" rows="3"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Цена, ₴</label>
          <input type="number" id="product-price" min="0" step="0.01" required>
        </div>
        <div class="form-group">
          <label>Старая цена, ₴</label>
          <input type="number" id="product-old-price" min="0" step="0.01">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Категория</label>
          <input type="text" id="product-category" required>
        </div>
        <div class="form-group">
          <label>Бренд</label>
          <input type="text" id="product-brand" required>
        </div>
      </div>
      <div class="form-group">
        <label>URL изображения</label>
        <input type="url" id="product-image">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>
            <input type="checkbox" id="product-in-stock"> В наличии
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="product-is-new"> Новинка
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Скидка, %</label>
        <input type="number" id="product-discount" min="0" max="100">
      </div>
      <button type="submit" class="btn btn-detail">Сохранить товар</button>
    </form>
  `;
  
  openModal();
}

// Функция сохранения нового товара
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
      // Переключаемся на вкладку товаров в админ-панели
      switchTab('products-tab');
    });
}

// Функция загрузки товаров в админ-панели
function loadAdminProducts() {
  const productsList = document.getElementById("admin-products-list");
  productsList.innerHTML = '<p>Загрузка товаров...</p>';
  
  db.collection("products")
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        productsList.innerHTML = '<p>Товаров нет</p>';
        return;
      }
      
      productsList.innerHTML = `
        <div style="margin-bottom: 15px;">
          <input type="text" id="admin-products-search" placeholder="Поиск товаров..." oninput="searchAdminProducts(this.value)" style="padding: 8px; width: 100%; border: 1px solid #ddd; border-radius: var(--border-radius);">
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
              <p>${product.description || 'Описание отсутствует'}</p>
              <p><strong>Цена:</strong> ${formatPrice(product.price)} ₴</p>
              <p><strong>Категория:</strong> ${product.category}</p>
              <p><strong>Бренд:</strong> ${product.brand}</p>
              <p><strong>Статус:</strong> ${product.inStock ? 'В наличии' : 'Нет в наличии'}</p>
            </div>
            <div>
              <img src="${product.image || 'https://via.placeholder.com/100x100?text=No+Image'}" alt="${product.title}" style="width: 100px; height: 100px; object-fit: cover; border-radius: var(--border-radius);">
            </div>
          </div>
          <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button class="btn btn-detail" onclick="editProduct('${product.id}')">Редактировать</button>
            <button class="btn" style="background: var(--danger); color: white;" onclick="deleteProduct('${product.id}')">Удалить</button>
          </div>
        `;
        
        productsContainer.appendChild(productElement);
      });
    })
    .catch((error) => {
      console.error("Ошибка загрузки товаров: ", error);
      productsList.innerHTML = '<p>Ошибка загрузки товаров</p>';
    });
}

// Функция поиска товаров в админ-панели
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

// Функция редактирования товара
function editProduct(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Редактировать товар</h3>
    <form onsubmit="updateProduct(event, '${productId}')">
      <div class="form-group">
        <label>Название товара</label>
        <input type="text" id="edit-product-title" value="${product.title}" required>
      </div>
      <div class="form-group">
        <label>Описание</label>
        <textarea id="edit-product-description" rows="3">${product.description || ''}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Цена, ₴</label>
          <input type="number" id="edit-product-price" value="${product.price}" min="0" step="0.01" required>
        </div>
        <div class="form-group">
          <label>Старая цена, ₴</label>
          <input type="number" id="edit-product-old-price" value="${product.oldPrice || ''}" min="0" step="0.01">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Категория</label>
          <input type="text" id="edit-product-category" value="${product.category}" required>
        </div>
        <div class="form-group">
          <label>Бренд</label>
          <input type="text" id="edit-product-brand" value="${product.brand}" required>
        </div>
      </div>
      <div class="form-group">
        <label>URL изображения</label>
        <input type="url" id="edit-product-image" value="${product.image || ''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-product-in-stock" ${product.inStock ? 'checked' : ''}> В наличии
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="edit-product-is-new" ${product.isNew ? 'checked' : ''}> Новинка
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Скидка, %</label>
        <input type="number" id="edit-product-discount" value="${product.discount || ''}" min="0" max="100">
      </div>
      <button type="submit" class="btn btn-detail">Сохранить изменения</button>
    </form>
  `;
  
  openModal();
}

// Функция обновления товара
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
      // Обновляем список товаров в админ-панели
      loadAdminProducts();
    });
}

// Функция удаления товара
function deleteProduct(productId) {
  if (confirm("Вы уверены, что хотите удалить этот товар? Это действие нельзя отменить.")) {
    db.collection("products").doc(productId).delete()
      .then(() => {
        showNotification("Товар успешно удален");
        // Обновляем список товаров
        loadAdminProducts();
        // Перезагружаем основные продукты
        loadProducts();
      })
      .catch((error) => {
        console.error("Ошибка удаления товара: ", error);
        showNotification("Ошибка удаления товара", "error");
      });
  }
}

// Функция открытия профиля пользователя
function openProfile() {
  if (!currentUser) {
    showNotification("Сначала войдите в систему", "warning");
    openAuthModal();
    return;
  }
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = `
    <h3>Профиль пользователя</h3>
    <div class="profile-info">
      <div class="form-group">
        <label>Имя</label>
        <input type="text" id="profile-name" value="${currentUser.displayName || ''}">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="profile-email" value="${currentUser.email || ''}" disabled>
      </div>
      <div class="form-group">
        <label>Новый пароль</label>
        <input type="password" id="profile-password" placeholder="Оставьте пустым, если не хотите менять">
      </div>
      <button class="btn btn-detail" onclick="updateProfile()">Сохранить изменения</button>
    </div>
  `;
  
  openModal();
}

// Функция обновления профиля пользователя
function updateProfile() {
  const name = document.getElementById('profile-name').value;
  const password = document.getElementById('profile-password').value;
  
  const updates = {};
  if (name !== currentUser.displayName) {
    updates.displayName = name;
  }
  
  // Обновляем профиль
  const promises = [currentUser.updateProfile(updates)];
  
  // Если указан новый пароль, обновляем его
  if (password) {
    promises.push(currentUser.updatePassword(password));
  }
  
  Promise.all(promises)
    .then(() => {
      showNotification("Профиль успешно обновлен");
      closeModal();
      // Обновляем имя пользователя в интерфейсе
      document.getElementById('user-name').textContent = name || currentUser.email;
    })
    .catch((error) => {
      console.error("Ошибка обновления профиля: ", error);
      showNotification("Ошибка обновления профиля: " + error.message, "error");
    });
}

// Функция просмотра заказов пользователя
function viewOrders() {
  if (!currentUser) {
    showNotification("Сначала войдите в систему", "warning");
    openAuthModal();
    return;
  }
  
  const modalContent = document.getElementById("modal-content");
  modalContent.innerHTML = '<h3>Мои заказы</h3><p>Загрузка заказов...</p>';
  
  openModal();
  
  // Загружаем заказы пользователя
  db.collection("orders")
    .where("userId", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        modalContent.innerHTML = `
          <h3>Мои заказы</h3>
          <div class="empty-cart">
            <i class="fas fa-box-open"></i>
            <h3>Заказов нет</h3>
            <p>Вы еще не совершали покупок в нашем магазине</p>
          </div>
        `;
        return;
      }
      
      let ordersHTML = '';
      querySnapshot.forEach((doc) => {
        const order = { id: doc.id, ...doc.data() };
        const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('ru-RU') : 'Дата не указана';
        
        // Определяем статус заказа
        let statusClass = 'status-new';
        let statusText = 'Новый';
        
        if (order.status === 'processing') {
          statusClass = 'status-processing';
          statusText = 'В обработке';
        } else if (order.status === 'shipped') {
          statusClass = 'status-shipped';
          statusText = 'Отправлен';
        } else if (order.status === 'delivered') {
          statusClass = 'status-delivered';
          statusText = 'Доставлен';
        } else if (order.status === 'cancelled') {
          statusClass = 'status-cancelled';
          statusText = 'Отменен';
        }
        
        ordersHTML += `
          <div class="order-item" style="border: 1px solid #eee; padding: 15px; margin-bottom: 15px; border-radius: 8px;">
            <h4>Заказ #${order.id}</h4>
            <p><strong>Дата:</strong> ${orderDate}</p>
            <p><strong>Сумма:</strong> ${formatPrice(order.total)} ₴</p>
            <p><strong>Статус:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
            <p><strong>Способ доставки:</strong> ${order.delivery.service}</p>
            <button class="btn btn-detail" onclick="viewOrderDetails('${order.id}')">Подробнее</button>
          </div>
        `;
      });
      
      modalContent.innerHTML = `
        <h3>Мои заказы</h3>
        <div class="user-orders">
          ${ordersHTML}
        </div>
      `;
    })
    .catch((error) => {
      console.error("Ошибка загрузки заказов: ", error);
      modalContent.innerHTML = `
        <h3>Мои заказы</h3>
        <p>Ошибка загрузки заказов. Пожалуйста, попробуйте позже.</p>
      `;
    });
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);