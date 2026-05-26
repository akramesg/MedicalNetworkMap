/**
 * MedSure Network A++ - Searchable Medical Provider Map Interface
 * Core Logic & Leaflet Map Integrations
 */

// Global State
let mapObj = null;
let markerClusterGroup = null;
let providersData = [];
let filteredProviders = [];
let activeTypes = new Set(['all']); // Set of active categories (e.g. 'مستشفى', 'صيدلية', etc. or 'all')
let searchQuery = "";
let selectedGov = "";
let selectedCity = "";
let selectedClass = "all"; // "all", "A+", "A"
let currentTheme = "dark";
let mapTileLayer = null;

// DOM Elements
const bodyEl = document.body;
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const resetViewBtn = document.getElementById("reset-view-btn");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const sidebarPanel = document.getElementById("sidebar-id");
const searchInput = document.getElementById("provider-search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const govSelect = document.getElementById("gov-select");
const citySelect = document.getElementById("city-select");
const listShimmer = document.getElementById("list-shimmer-id");
const providersList = document.getElementById("providers-list-id");
const detailSheet = document.getElementById("detail-sheet-id");
const detailSheetContent = document.getElementById("detail-sheet-content-id");
const closeSheetBtn = document.getElementById("close-sheet-btn-id");
const resetFiltersBtn = document.getElementById("reset-filters-btn");

// Stat counters
const tickerTotal = document.getElementById("ticker-total");
const tickerGovs = document.getElementById("ticker-govs");
const filteredCountText = document.getElementById("filtered-count");
const totalCountText = document.getElementById("total-count");

// Legend pills & Tickers counts
const countAll = document.getElementById("count-all");
const countHospitals = document.getElementById("count-hospitals");
const countLabs = document.getElementById("count-labs");
const countPharmacies = document.getElementById("count-pharmacies");
const countClinics = document.getElementById("count-clinics");
const countRadiology = document.getElementById("count-radiology");

// Category Helpers
const CATEGORY_MAPPINGS = {
    "مستشفى": { class: "hospital", icon: "fa-hospital" },
    "معمل تحاليل": { class: "lab", icon: "fa-microscope" },
    "صيدلية": { class: "pharmacy", icon: "fa-prescription-bottle-medical" },
    "عيادة": { class: "clinic", icon: "fa-user-doctor" },
    "مجمع عيادات": { class: "clinic", icon: "fa-user-doctor" },
    "مركز طبي متخصص": { class: "clinic", icon: "fa-user-doctor" },
    "مركز علاج طبيعي": { class: "clinic", icon: "fa-user-doctor" },
    "أسنان": { class: "clinic", icon: "fa-tooth" },
    "مركز أشعة": { class: "radiology", icon: "fa-x-ray" },
    "أشعة/تحاليل": { class: "radiology", icon: "fa-x-ray" },
    "مركز بصريات": { class: "other", icon: "fa-glasses" }
};

function getCategoryTheme(type) {
    return CATEGORY_MAPPINGS[type] || { class: "other", icon: "fa-user-nurse" };
}

// Map groups into top-level switches
function getTypeGroup(type) {
    if (type === "مستشفى") return "مستشفى";
    if (type === "معمل تحاليل" || type === "أشعة/تحاليل") return "معمل تحاليل";
    if (type === "صيدلية") return "صيدلية";
    if (type === "مركز أشعة") return "مركز أشعة";
    if (["عيادة", "مجمع عيادات", "مركز طبي متخصص", "مركز علاج طبيعي", "أسنان"].includes(type)) return "عيادة";
    return "other";
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initMap();
    fetchData();
    setupEventListeners();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem("medsure-theme") || "dark";
    currentTheme = savedTheme;
    bodyEl.className = currentTheme === "dark" ? "dark-theme" : "light-theme";
    updateThemeToggleButton();
}

function updateThemeToggleButton() {
    if (!themeToggleBtn) return;
    if (currentTheme === "dark") {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        themeToggleBtn.title = "المظهر المضيء";
    } else {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        themeToggleBtn.title = "المظهر الداكن";
    }
}

function toggleTheme() {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    bodyEl.className = currentTheme === "dark" ? "dark-theme" : "light-theme";
    localStorage.setItem("medsure-theme", currentTheme);
    updateThemeToggleButton();

    // Redraw map tile layer based on active theme
    if (mapObj && mapTileLayer) {
        mapObj.removeLayer(mapTileLayer);
        const tileUrl = currentTheme === "dark" 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
        
        mapTileLayer = L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 20
        });
        mapTileLayer.addTo(mapObj);
    }
}

// Map Management
function initMap() {
    // Center of Egypt
    const defaultCenter = [29.2, 31.0];
    const defaultZoom = 7;

    mapObj = L.map("map", {
        zoomControl: true,
        attributionControl: true,
        rtl: true // RTL Support
    }).setView(defaultCenter, defaultZoom);

    // Zoom controls at bottom-left
    mapObj.zoomControl.setPosition("bottomleft");

    // Add theme-appropriate tiles
    const tileUrl = currentTheme === "dark" 
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
        
    mapTileLayer = L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20
    });
    mapTileLayer.addTo(mapObj);

    // Initialize cluster group with beautiful cluster customization
    markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        chunkedLoading: true
    });
    mapObj.addLayer(markerClusterGroup);
}

// ==========================================
// DATA ACQUISITION & PRE-PROCESSING
// ==========================================
async function fetchData() {
    try {
        const response = await fetch("providers.json");
        if (!response.ok) {
            throw new Error("فشل تحميل ملف البيانات.");
        }
        providersData = await response.json();
        filteredProviders = [...providersData];
        
        // Hide Shimmer
        if (listShimmer) listShimmer.style.display = "none";
        
        initFilterDropdowns();
        updateStats();
        renderMapMarkers();
        renderSidebarList();
    } catch (err) {
        console.error(err);
        if (providersList) {
            providersList.innerHTML = `
                <div class="empty-notice">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--col-hospital)"></i>
                    <h3>خطأ في تحميل البيانات</h3>
                    <p>عذراً، تعذر تحميل قائمة مقدمي الخدمة. يرجى التأكد من تشغيل ملف تهيئة البيانات.</p>
                </div>
            `;
        }
    }
}

// Dropdowns setup
function initFilterDropdowns() {
    // Extract unique Governorates and Cities
    const govs = new Set();
    providersData.forEach(p => {
        if (p.g) govs.add(p.g);
    });

    // Populate Gov Dropdown
    Array.from(govs).sort().forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        govSelect.appendChild(opt);
    });
}

function updateCityDropdown() {
    // Clear previous options except first
    citySelect.innerHTML = '<option value="">كل المدن</option>';
    
    if (!selectedGov) {
        citySelect.disabled = true;
        return;
    }

    const cities = new Set();
    providersData.forEach(p => {
        if (p.g === selectedGov && p.c) {
            cities.add(p.c);
        }
    });

    Array.from(cities).sort().forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        citySelect.appendChild(opt);
    });

    citySelect.disabled = false;
}

// ==========================================
// SEARCH & FILTER LOGIC
// ==========================================
function filterData() {
    const query = searchQuery.toLowerCase().trim();
    
    filteredProviders = providersData.filter(p => {
        // Text Search (Name, Speciality, Services, Address, City)
        const matchesQuery = !query || 
            (p.n && p.n.toLowerCase().includes(query)) ||
            (p.sp && p.sp.toLowerCase().includes(query)) ||
            (p.se && p.se.toLowerCase().includes(query)) ||
            (p.a && p.a.toLowerCase().includes(query)) ||
            (p.c && p.c.toLowerCase().includes(query));

        // Governorate Filter
        const matchesGov = !selectedGov || p.g === selectedGov;

        // City Filter
        const matchesCity = !selectedCity || p.c === selectedCity;

        // Network Class Filter
        const matchesClass = selectedClass === "all" || p.nc === selectedClass;

        // Category Type Switches
        const group = getTypeGroup(p.t);
        const matchesType = activeTypes.has("all") || activeTypes.has(group);

        return matchesQuery && matchesGov && matchesCity && matchesClass && matchesType;
    });

    // Re-render
    updateStats();
    renderMapMarkers();
    renderSidebarList();
}

// Statistics Management
function updateStats() {
    // Total Filtered Counts
    const total = filteredProviders.length;
    filteredCountText.textContent = total;
    totalCountText.textContent = providersData.length;
    tickerTotal.textContent = total;

    // Unique Governorates
    const govs = new Set(filteredProviders.map(p => p.g).filter(Boolean));
    tickerGovs.textContent = govs.size;

    // Update legend pills count
    let counts = {
        all: filteredProviders.length,
        hospital: 0,
        lab: 0,
        pharmacy: 0,
        clinic: 0,
        radiology: 0
    };

    filteredProviders.forEach(p => {
        const grp = getTypeGroup(p.t);
        if (grp === "مستشفى") counts.hospital++;
        else if (grp === "معمل تحاليل") counts.lab++;
        else if (grp === "صيدلية") counts.pharmacy++;
        else if (grp === "عيادة") counts.clinic++;
        else if (grp === "مركز أشعة") counts.radiology++;
    });

    // Update UI Tickers
    countAll.textContent = counts.all;
    countHospitals.textContent = counts.hospital;
    countLabs.textContent = counts.lab;
    countPharmacies.textContent = counts.pharmacy;
    countClinics.textContent = counts.clinic;
    countRadiology.textContent = counts.radiology;
}

// ==========================================
// RENDER COMPONENT MAP MARKERS (60fps optimized)
// ==========================================
function renderMapMarkers() {
    if (!mapObj || !markerClusterGroup) return;

    markerClusterGroup.clearLayers();

    const markersList = [];

    filteredProviders.forEach(p => {
        if (!p.lat || !p.lng) return;

        const category = getCategoryTheme(p.t);
        const markerClass = category.class;
        const iconName = category.icon;

        // Custom HTML Marker using DivIcon
        const customIcon = L.divIcon({
            html: `
                <div class="custom-leaflet-marker ${markerClass}" id="marker-prov-${p.id}">
                    <div class="marker-pin-wrapper">
                        <span class="marker-icon"><i class="fa-solid ${iconName}"></i></span>
                    </div>
                </div>
            `,
            className: 'div-icon-wrapper',
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -38]
        });

        const marker = L.marker([p.lat, p.lng], { icon: customIcon });

        // Simple tooltip popup content
        const popupContent = `
            <div class="popup-bubble">
                <span class="popup-title">${p.n}</span>
                <span class="popup-type">${p.t} - شبكة ${p.nc}</span>
                <span class="popup-addr"><i class="fa-solid fa-location-dot"></i> ${p.c || p.g}</span>
            </div>
        `;
        marker.bindPopup(popupContent, { closeButton: false });

        // Click actions
        marker.on("click", () => {
            showDetailSheet(p);
            highlightSidebarCard(p.id);
        });

        // Add to array for batch cluster addition (extremely fast!)
        markersList.push(marker);
    });

    markerClusterGroup.addLayers(markersList);
}

// ==========================================
// RENDER SIDEBAR LIST (DOM Optimized)
// ==========================================
function renderSidebarList() {
    if (!providersList) return;

    providersList.innerHTML = "";

    if (filteredProviders.length === 0) {
        providersList.innerHTML = `
            <div class="empty-notice">
                <i class="fa-solid fa-folder-open"></i>
                <h3>لا توجد نتائج مطابقة</h3>
                <p>يرجى تعديل فلاتر البحث أو الكلمات الدليليلة للمحاولة مرة أخرى.</p>
            </div>
        `;
        return;
    }

    // Limit visible sidebar elements to first 100 for maximum performance.
    // Map markers still plot ALL points on the Leaflet Canvas.
    const sliceCount = 100;
    const slice = filteredProviders.slice(0, sliceCount);

    slice.forEach(p => {
        const category = getCategoryTheme(p.t);
        const card = document.createElement("div");
        card.className = "provider-card";
        card.id = `provider-card-${p.id}`;
        card.setAttribute("data-type-group", getTypeGroup(p.t));

        card.innerHTML = `
            <div class="card-top">
                <span class="card-type ${category.class}">${p.t}</span>
                <div class="card-meta-badges">
                    <span class="badge-net">شبكة ${p.nc}</span>
                </div>
            </div>
            <h3 class="card-name">${p.n}</h3>
            ${p.sp ? `<div class="card-spec"><i class="fa-solid fa-stethoscope"></i> ${p.sp}</div>` : ""}
            <div class="card-addr"><i class="fa-solid fa-location-dot"></i> ${p.g}، ${p.c}</div>
        `;

        card.addEventListener("click", () => {
            // Focus map on provider
            focusOnProvider(p);
            showDetailSheet(p);
            highlightSidebarCard(p.id);
        });

        providersList.appendChild(card);
    });

    if (filteredProviders.length > sliceCount) {
        const loadNotice = document.createElement("div");
        loadNotice.style.cssText = "text-align: center; padding: 12px; font-size: 0.78rem; color: var(--text-dim); border-top: 1px dashed var(--border-color);";
        loadNotice.textContent = `تم عرض أول ${sliceCount} مقدم خدمة فقط لتسريع الأداء. استخدم الفلاتر لتضييق نطاق البحث.`;
        providersList.appendChild(loadNotice);
    }
}

// Focused Provider Actions
function focusOnProvider(p) {
    if (!mapObj) return;
    mapObj.flyTo([p.lat, p.lng], 15, {
        animate: true,
        duration: 1.2
    });
}

function highlightSidebarCard(id) {
    // Clear active card states
    document.querySelectorAll(".provider-card").forEach(c => c.classList.remove("active"));
    
    const selectedCard = document.getElementById(`provider-card-${id}`);
    if (selectedCard) {
        selectedCard.classList.add("active");
        selectedCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

// ==========================================
// DETAILS SHEET / PANEL
// ==========================================
function showDetailSheet(p) {
    if (!detailSheet || !detailSheetContent) return;

    const category = getCategoryTheme(p.t);

    // Build directions link (Google Maps search queries or direct coordinates)
    const mapLink = p.u || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.n + ' ' + p.g)}`;

    detailSheetContent.innerHTML = `
        <div class="detail-head">
            <div class="detail-title-block">
                <span class="detail-type-badge ${category.class}">${p.t}</span>
                <h3 class="detail-title">${p.n}</h3>
                <div class="detail-badges-row">
                    <span class="badge-net">شبكة تصنيف: ${p.nc}</span>
                </div>
            </div>
            <a href="${mapLink}" target="_blank" class="detail-directions-btn" rel="noopener">
                <i class="fa-solid fa-map-location-dot"></i> الحصول على الاتجاهات
            </a>
        </div>
        <div class="detail-info-grid">
            <div class="detail-info-card">
                <h4><i class="fa-solid fa-map-marker-alt"></i> العنوان والمنطقة</h4>
                <p>${p.a || 'غير مدرج'}</p>
                <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">${p.g} - ${p.c}</p>
            </div>
            <div class="detail-info-card">
                <h4><i class="fa-solid fa-clock"></i> مواعيد العمل والاتصال</h4>
                <p>${p.h || '24/7 (طوال اليوم)'}</p>
                ${p.sc ? `<p style="font-size:0.78rem; margin-top:4px; color:var(--primary);"><i class="fa-solid fa-calendar-days"></i> عيادات: ${p.sc}</p>` : ''}
            </div>
            <div class="detail-info-card">
                <h4><i class="fa-solid fa-circle-info"></i> التخصصات والخدمات</h4>
                <p><strong>تخصصات:</strong> ${p.sp || 'جميع التخصصات الطبية'}</p>
                ${p.se ? `<p style="margin-top:4px;"><strong>خدمات أخرى:</strong> ${p.se}</p>` : ''}
            </div>
        </div>
    `;

    // Slide in
    detailSheet.classList.add("active");
}

function hideDetailSheet() {
    if (detailSheet) detailSheet.classList.remove("active");
    document.querySelectorAll(".provider-card").forEach(c => c.classList.remove("active"));
}

// ==========================================
// EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
    // Theme toggle click
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }

    // Reset View Map click
    if (resetViewBtn) {
        resetViewBtn.addEventListener("click", () => {
            if (mapObj) {
                mapObj.setView([29.2, 31.0], 7);
                hideDetailSheet();
            }
        });
    }

    // Map click collapses mobile sidebar
    if (mapObj) {
        mapObj.on("click", () => {
            if (window.innerWidth <= 900) {
                sidebarPanel.classList.remove("expanded");
            }
        });
    }

    // Mobile drag handle trigger
    const mobileHandle = document.getElementById("mobile-handle-id");
    if (mobileHandle) {
        mobileHandle.addEventListener("click", (e) => {
            e.stopPropagation();
            sidebarPanel.classList.toggle("expanded");
        });
    }

    // Mobile top-left close button trigger
    const mobileCloseBtn = document.getElementById("mobile-close-sidebar-btn-id");
    if (mobileCloseBtn) {
        mobileCloseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            sidebarPanel.classList.remove("expanded");
        });
    }

    // Advanced filters header collapsible click trigger
    const filterHeader = document.getElementById("filters-header-id");
    const filterCard = document.getElementById("filter-card-id");
    if (filterHeader && filterCard) {
        filterHeader.addEventListener("click", () => {
            filterCard.classList.toggle("collapsed");
        });
    }

    // Input click/focus expands mobile drawer
    if (searchInput) {
        searchInput.addEventListener("click", (e) => {
            if (window.innerWidth <= 900) {
                sidebarPanel.classList.add("expanded");
            }
        });
        searchInput.addEventListener("focus", (e) => {
            if (window.innerWidth <= 900) {
                sidebarPanel.classList.add("expanded");
            }
        });
    }

    // Mobile floating list button trigger
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener("click", () => {
            sidebarPanel.classList.toggle("expanded");
        });
    }

    // Real-Time Search typing listener (debounced slightly)
    let searchTimeout = null;
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const val = e.target.value;
            searchQuery = val;
            
            // Show clear button
            if (val) {
                clearSearchBtn.style.display = "block";
            } else {
                clearSearchBtn.style.display = "none";
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filterData();
            }, 250); // 250ms debounce
        });
    }

    // Clear search trigger
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            searchQuery = "";
            clearSearchBtn.style.display = "none";
            filterData();
            searchInput.focus();
        });
    }

    // Governorate filter select
    if (govSelect) {
        govSelect.addEventListener("change", (e) => {
            selectedGov = e.target.value;
            selectedCity = ""; // Reset city
            updateCityDropdown();
            filterData();
        });
    }

    // City filter select
    if (citySelect) {
        citySelect.addEventListener("change", (e) => {
            selectedCity = e.target.value;
            filterData();
        });
    }

    // Network Class Pill Chips filters
    document.querySelectorAll(".chip[data-class]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".chip[data-class]").forEach(c => c.classList.remove("active"));
            e.target.classList.add("active");
            selectedClass = e.target.getAttribute("data-class");
            filterData();
        });
    });

    // Legend Categories point switches (Switching category layers on and off!)
    document.querySelectorAll(".legend-pill").forEach(pill => {
        pill.addEventListener("click", (e) => {
            const pillEl = e.currentTarget;
            const type = pillEl.getAttribute("data-type");

            if (type === "all") {
                // If clicking all, toggle all active
                const isAllActive = pillEl.classList.contains("active");
                if (isAllActive) {
                    // Turn off all
                    pillEl.classList.remove("active");
                    document.querySelectorAll(".legend-pill").forEach(p => p.classList.remove("active"));
                    activeTypes.clear();
                } else {
                    // Turn on all
                    pillEl.classList.add("active");
                    document.querySelectorAll(".legend-pill").forEach(p => p.classList.add("active"));
                    activeTypes.clear();
                    activeTypes.add("all");
                }
            } else {
                // Normal category toggle
                pillEl.classList.toggle("active");
                
                // If "all" pill was active, toggle it off because we're entering multi-select mode
                const allPill = document.querySelector(".legend-pill[data-type='all']");
                if (allPill) allPill.classList.remove("active");
                
                if (activeTypes.has("all")) {
                    activeTypes.clear();
                    // Load current active UI categories
                    document.querySelectorAll(".legend-pill:not([data-type='all']).active").forEach(p => {
                        activeTypes.add(p.getAttribute("data-type"));
                    });
                } else {
                    if (pillEl.classList.contains("active")) {
                        activeTypes.add(type);
                    } else {
                        activeTypes.delete(type);
                    }
                }
                
                // If zero elements selected, automatically reset to 'all'
                if (activeTypes.size === 0) {
                    if (allPill) allPill.classList.add("active");
                    document.querySelectorAll(".legend-pill").forEach(p => p.classList.add("active"));
                    activeTypes.add("all");
                }
            }

            filterData();
        });
    });

    // Close detail sheet
    if (closeSheetBtn) {
        closeSheetBtn.addEventListener("click", hideDetailSheet);
    }

    // Reset Filters button link
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener("click", () => {
            searchInput.value = "";
            searchQuery = "";
            clearSearchBtn.style.display = "none";
            
            govSelect.value = "";
            selectedGov = "";
            updateCityDropdown();
            
            selectedCity = "";
            selectedClass = "all";
            
            // Reset chips state
            document.querySelectorAll(".chip[data-class]").forEach(c => {
                c.classList.remove("active");
                if (c.getAttribute("data-class") === "all") c.classList.add("active");
            });

            // Reset legend pills
            document.querySelectorAll(".legend-pill").forEach(p => p.classList.add("active"));
            activeTypes.clear();
            activeTypes.add("all");

            filterData();
            hideDetailSheet();
        });
    }
}
