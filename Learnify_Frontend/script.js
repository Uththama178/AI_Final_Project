document.addEventListener("DOMContentLoaded", function () {
    const navbar = document.getElementById("navbar");
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll("section");

    // 1. CHANGE NAVBAR STYLE ON SCROLL
    window.addEventListener("scroll", () => {
        if (window.scrollY > 50) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }

        // 2. DETECT DYNAMIC SECTION HIGHLIGHTING ON SCROLL
        let currentSectionId = "";
        sections.forEach((section) => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            // Target elements checked with offset triggers
            if (window.scrollY >= sectionTop - 150) {
                currentSectionId = section.getAttribute("id");
            }
        });

        navItems.forEach((item) => {
            item.classList.remove("active");
            if (item.getAttribute("href") === `#${currentSectionId}`) {
                item.classList.add("active");
            }
        });
    });
});