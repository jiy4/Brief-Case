// ============================================
// BRIEF-CASE MASTER NAVIGATION SYSTEM
// ============================================
// File: js/navigation.js
// Add to ALL HTML pages: <script src="js/navigation.js"></script>

// Page URLs
const PAGES = {
    HOME: 'index.html',
    HOME_LOGGED_IN: 'home.html',
    SIGNUP: 'signup.html',
    LOGIN: 'login.html',
    LAWYER_SEARCH: 'lawyer-search.html',
    LAWYER_PROFILE: 'lawyer-profile.html',
    BOOK_APPOINTMENT: 'book-appointment.html',
    PAYMENT: 'payment.html',
    MESSAGES: 'messages.html',
    CLIENT_PROFILE: 'client-profile.html',
    LAWYER_PROFILE_SETTINGS: 'lawyer-profile-settings.html',
    ABOUT: 'about.html',
    WHATS_NEW: 'whats-new.html',
    DONATE: 'donate.html'
};

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

function navigate(page, data = null) {
    if (data) {
        sessionStorage.setItem('pageData', JSON.stringify(data));
    }
    window.location.href = page;
}

function getPageData() {
    const data = sessionStorage.getItem('pageData');
    sessionStorage.removeItem('pageData');
    return data ? JSON.parse(data) : null;
}

function goBack() {
    window.history.back();
}

// Common navigation functions
function goToHome() {
    navigate(PAGES.HOME);
}

function goToLogin() {
    navigate(PAGES.LOGIN);
}

function goToSignup() {
    navigate(PAGES.SIGNUP);
}

function goToLawyerSearch(query = null) {
    if (query) {
        navigate(`${PAGES.LAWYER_SEARCH}?q=${encodeURIComponent(query)}`);
    } else {
        navigate(PAGES.LAWYER_SEARCH);
    }
}

function goToLawyerProfile(lawyerId) {
    navigate(`${PAGES.LAWYER_PROFILE}?id=${lawyerId}`);
}

function goToBookAppointment(lawyerId) {
    navigate(`${PAGES.BOOK_APPOINTMENT}?lawyerId=${lawyerId}`);
}

function goToPayment(appointmentData) {
    navigate(PAGES.PAYMENT, appointmentData);
}

function goToMessages(conversationId = null) {
    if (conversationId) {
        navigate(`${PAGES.MESSAGES}?conversation=${conversationId}`);
    } else {
        navigate(PAGES.MESSAGES);
    }
}

function goToAbout() {
    navigate(PAGES.ABOUT);
}

function goToWhatsNew() {
    navigate(PAGES.WHATS_NEW);
}

function goToDonate() {
    navigate(PAGES.DONATE);
}

async function goToProfile() {
    const userType = localStorage.getItem('userType');
    if (userType === 'lawyer') {
        navigate(PAGES.LAWYER_PROFILE_SETTINGS);
    } else {
        navigate(PAGES.CLIENT_PROFILE);
    }
}

// ============================================
// URL PARAMETER HELPERS
// ============================================

function getUrlParameter(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function getAllUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

// ============================================
// EXPORT TO WINDOW
// ============================================

window.Navigation = {
    PAGES,
    navigate,
    getPageData,
    goBack,
    goToHome,
    goToLogin,
    goToSignup,
    goToLawyerSearch,
    goToLawyerProfile,
    goToBookAppointment,
    goToPayment,
    goToMessages,
    goToAbout,
    goToWhatsNew,
    goToDonate,
    goToProfile,
    getUrlParameter,
    getAllUrlParameters
};

// Make functions global for easy access in HTML onclick
Object.assign(window, {
    navigate,
    goBack,
    goToHome,
    goToLogin,
    goToSignup,
    goToLawyerSearch,
    goToLawyerProfile,
    goToBookAppointment,
    goToPayment,
    goToMessages,
    goToAbout,
    goToWhatsNew,
    goToDonate,
    goToProfile
});

console.log('✅ Navigation system loaded');