/**
 * Learnify Student Dashboard — dynamic UI bindings
 * Displays logged-in student name and wires sidebar/tab/logout behavior.
 */
document.addEventListener("DOMContentLoaded", function () {

    // ==========================================
    // GLOBAL CONFIGURATION
    // ==========================================
    const API_BASE_URL = "http://127.0.0.1:8000";

    // ==========================================
    // 1. ROUTE GUARD
    // ==========================================
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");
    const userName = localStorage.getItem("user_name");
    const userEmail = localStorage.getItem("user_email");

    if (!token || !role || (role.toLowerCase() !== "student" && role.toLowerCase() !== "both")) {
        alert("Access Denied! Please login as a Student.");
        window.location.href = "login.html";
        return;
    }

    console.log("✅ Student logged in:", userName);

    // ==========================================
    // 2. DISPLAY STUDENT NAME (HEADER + META)
    // ==========================================
    const displayName = userName && String(userName).trim() ? String(userName).trim() : "Student";
    const displayEmail = userEmail && String(userEmail).trim() ? String(userEmail).trim() : "student@learnify.com";

    const studentNameEl = document.getElementById("student-name");
    const studentDisplayNameEl = document.getElementById("student-display-name");
    const studentDisplayEmailEl = document.getElementById("student-display-email");

    if (studentNameEl) {
        studentNameEl.textContent = displayName;
    }
    if (studentDisplayNameEl) {
        studentDisplayNameEl.textContent = displayName;
    }
    if (studentDisplayEmailEl) {
        studentDisplayEmailEl.textContent = displayEmail;
    }

    // ==========================================
    // 3. SIDEBAR TAB NAVIGATION
    // ==========================================
    const menuItems = document.querySelectorAll(".student-menu .student-menu-item");
    const tabContents = document.querySelectorAll(".student-tab-content");

    menuItems.forEach((item) => {
        item.addEventListener("click", function () {
            menuItems.forEach((i) => i.classList.remove("active"));
            tabContents.forEach((tc) => tc.classList.remove("active"));

            this.classList.add("active");
            const tabId = this.getAttribute("data-tab");
            const targetTab = document.getElementById(tabId);
            if (targetTab) {
                targetTab.classList.add("active");
            }
        });
    });

    // ==========================================
    // 4. LOGOUT
    // ==========================================
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
            localStorage.clear();
            alert("Logged out successfully!");
            window.location.href = "login.html";
        });
    }

    // ==========================================
    // 5. SHARED AUTH HEADER HELPER (for future API calls)
    // ==========================================
    function getAuthHeaders() {
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    }

    // Expose for future student feature modules without breaking current bindings
    window.LearnifyStudentDashboard = {
        API_BASE_URL,
        token,
        userName: displayName,
        userEmail: displayEmail,
        getAuthHeaders,
    };

    console.log("✅ Student Dashboard initialized successfully!");
});
