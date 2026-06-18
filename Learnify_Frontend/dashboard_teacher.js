document.addEventListener("DOMContentLoaded", function () {
    
    // ==========================================
    // 1. 🛡️ ROUTE GUARD (ආරක්ෂණ පියවර)
    // ==========================================
    const token = localStorage.getItem("access_token");
    const role = localStorage.getItem("user_role");
    const userName = localStorage.getItem("user_name");
    const userEmail = localStorage.getItem("user_email");

    // ටෝකන් එක නැත්නම් හෝ රෝල් එක teacher/both නොවෙයි නම් ලොගින් එකට හරවා යැවීම
    if (!token || !role || (role.toLowerCase() !== "teacher" && role.toLowerCase() !== "both")) {
        alert("Access Denied! Please login as a Teacher.");
        window.location.href = "login.html";
        return; 
    }

    // ==========================================
    // 2. 👤 DISPLAY TEACHER INFO (HTML IDs වලට දත්ත දැමීම)
    // ==========================================
    // ඔයාගේ HTML එකේ තියෙන නිවැරදිම IDs: "teacher-display-name" සහ "teacher-display-email"
    const nameDisplay = document.getElementById("teacher-display-name");
    const emailDisplay = document.getElementById("teacher-display-email");

    if (nameDisplay && userName) {
        nameDisplay.textContent = userName;
    }
    if (emailDisplay && userEmail) {
        emailDisplay.textContent = userEmail;
    }

    // ==========================================
    // 3. 📑 TAB SWITCHING LOGIC (ටැබ් මාරු වීමේ ලොජික් එක)
    // ==========================================
    const menuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    const tabContents = document.querySelectorAll(".tab-content");

    menuItems.forEach(item => {
        item.addEventListener("click", function () {
            // පරණ Active ක්ලාස් අයින් කිරීම
            menuItems.forEach(i => i.classList.remove("active"));
            tabContents.forEach(tc => tc.classList.remove("active"));

            // ක්ලික් කරපු ටැබ් එක Active කිරීම
            this.classList.add("active");
            const tabId = this.getAttribute("data-tab");
            const targetTab = document.getElementById(tabId);
            if (targetTab) {
                targetTab.classList.add("active");
            }
        });
    });

    // ==========================================
    // 4. 🚪 LOGOUT LOGIC (ලොග් අවුට් වීම)
    // ==========================================
    // ඔයාගේ HTML එකේ තියෙන නිවැරදිම ID එක: "logout-btn"
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function () {
            localStorage.clear(); // LocalStorage එක ක්ලියර් කිරීම
            alert("Logged out successfully!");
            window.location.href = "login.html";
        });
    }

    // ==========================================
    // 5. 🚀 COURSE UPLOAD HANDLING LOGIC
    // ==========================================
    const courseForm = document.getElementById("course-upload-form");
    if (courseForm) {
        courseForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const title = document.getElementById("course-title").value;
            const description = document.getElementById("course-desc").value;
            const price = document.getElementById("course-price").value;
            
            console.log("Form Data Captured:", { title, description, price });
            alert("Ready to connect with Backend! Course: " + title);
        });
    }
});