// Theme and layout management
const storageKey = "xonra-theme";
const layoutKey = "xonra-layout";
const themeToggle = document.querySelector(".theme-toggle");
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

// Available themes
const themes = ['light', 'dark', 'forest', 'ocean', 'sunset', 'monochrome'];
const layouts = ['default', 'compact', 'spacious'];

function setTheme(theme) {
    document.body.dataset.theme = theme;

    if (themeToggle) {
        const themeNames = {
            'light': 'Light',
            'dark': 'Dark',
            'forest': 'Forest',
            'ocean': 'Ocean',
            'sunset': 'Sunset',
            'monochrome': 'Mono'
        };
        const nextTheme = theme === "light" ? "dark" : "light";
        themeToggle.textContent = `${themeNames[nextTheme]} mode`;
        themeToggle.setAttribute("aria-label", `Switch to ${themeNames[nextTheme]} mode`);
    }
    

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = theme;
    }
}

function setLayout(layout) {
    document.body.dataset.layout = layout;
    

    const layoutSelect = document.getElementById('layoutSelect');
    if (layoutSelect) {
        layoutSelect.value = layout;
    }
}

function getPreferredTheme() {
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme && themes.includes(savedTheme)) {
        return savedTheme;
    }
    return systemTheme.matches ? "dark" : "light";
}

function getPreferredLayout() {
    const savedLayout = localStorage.getItem(layoutKey);
    if (savedLayout && layouts.includes(savedLayout)) {
        return savedLayout;
    }
    return "default";
}


setTheme(getPreferredTheme());
setLayout(getPreferredLayout());


if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const currentTheme = document.body.dataset.theme || getPreferredTheme();
        const currentIndex = themes.indexOf(currentTheme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        setTheme(nextTheme);
        localStorage.setItem(storageKey, nextTheme);
    });
}

systemTheme.addEventListener("change", (event) => {
    if (localStorage.getItem(storageKey)) return;
    setTheme(event.matches ? "dark" : "light");
});


document.addEventListener('DOMContentLoaded', () => {
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        const currentTheme = document.body.dataset.theme || getPreferredTheme();
        themeSelect.value = currentTheme;

        themeSelect.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            setTheme(newTheme);
            localStorage.setItem(storageKey, newTheme);
        });
    }

    const themePresets = document.querySelectorAll('.theme-preset');
    themePresets.forEach(preset => {
        preset.addEventListener('click', () => {
            const theme = preset.dataset.theme;
            setTheme(theme);
            localStorage.setItem(storageKey, theme);
            if (themeSelect) {
                themeSelect.value = theme;
            }
        });
    });

    const layoutSelect = document.getElementById('layoutSelect');
    if (layoutSelect) {
        const currentLayout = document.body.dataset.layout || getPreferredLayout();
        layoutSelect.value = currentLayout;

        layoutSelect.addEventListener('change', (e) => {
            const newLayout = e.target.value;
            setLayout(newLayout);
            localStorage.setItem(layoutKey, newLayout);
        });
    }

    const cardWidthSlider = document.getElementById('cardWidth');
    const cardWidthValue = document.getElementById('cardWidthValue');
    const sectionSpacingSlider = document.getElementById('sectionSpacing');
    const sectionSpacingValue = document.getElementById('sectionSpacingValue');

    if (cardWidthSlider) {
        const savedCardWidth = localStorage.getItem('xonra-card-width') || '360';
        cardWidthSlider.value = savedCardWidth;
        cardWidthValue.textContent = savedCardWidth + 'px';
        document.documentElement.style.setProperty('--card-width', savedCardWidth + 'px');

        cardWidthSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            cardWidthValue.textContent = value + 'px';
            document.documentElement.style.setProperty('--card-width', value + 'px');
            localStorage.setItem('xonra-card-width', value);
        });
    }

    if (sectionSpacingSlider) {
        const savedSectionSpacing = localStorage.getItem('xonra-section-spacing') || '88';
        sectionSpacingSlider.value = savedSectionSpacing;
        sectionSpacingValue.textContent = savedSectionSpacing + 'px';
        document.documentElement.style.setProperty('--section-spacing', savedSectionSpacing + 'px');

        sectionSpacingSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            sectionSpacingValue.textContent = value + 'px';
            document.documentElement.style.setProperty('--section-spacing', value + 'px');
            localStorage.setItem('xonra-section-spacing', value);
        });
    }

    const resetButton = document.getElementById('resetCustomization');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (cardWidthSlider) {
                cardWidthSlider.value = '360';
                cardWidthValue.textContent = '360px';
                document.documentElement.style.setProperty('--card-width', '360px');
                localStorage.setItem('xonra-card-width', '360');
            }
            if (sectionSpacingSlider) {
                sectionSpacingSlider.value = '88';
                sectionSpacingValue.textContent = '88px';
                document.documentElement.style.setProperty('--section-spacing', '88px');
                localStorage.setItem('xonra-section-spacing', '88');
            }
            setLayout('default');
            if (layoutSelect) {
                layoutSelect.value = 'default';
            }
            localStorage.setItem(layoutKey, 'default');
        });
    }

    const savedCardWidth = localStorage.getItem('xonra-card-width');
    if (savedCardWidth) {
        document.documentElement.style.setProperty('--card-width', savedCardWidth + 'px');
    }

    const savedSectionSpacing = localStorage.getItem('xonra-section-spacing');
    if (savedSectionSpacing) {
        document.documentElement.style.setProperty('--section-spacing', savedSectionSpacing + 'px');
    }

    const header = document.querySelector('header');
    const navToggle = document.querySelector('.nav-toggle');
    const menu = document.getElementById('site-menu');
    const dropdowns = document.querySelectorAll('.dropdown');
    const dropdownButtons = document.querySelectorAll('.home-dropdown-btn');

    function closeDropdowns() {
        dropdowns.forEach((dropdown) => {
            dropdown.classList.remove('is-open');
        });

        dropdownButtons.forEach((button) => {
            button.setAttribute('aria-expanded', 'false');
        });
    }

    function closeMenu() {
        if (!header || !navToggle) return;

        header.classList.remove('nav-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open navigation');
        document.body.classList.remove('menu-open');
        closeDropdowns();
    }

    function openMenu() {
        if (!header || !navToggle) return;

        header.classList.add('nav-open');
        navToggle.setAttribute('aria-expanded', 'true');
        navToggle.setAttribute('aria-label', 'Close navigation');
        document.body.classList.add('menu-open');
    }

    if (navToggle && menu) {
        navToggle.addEventListener('click', () => {
            const isOpen = header.classList.contains('nav-open');

            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        });
    }

    dropdownButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const dropdown = button.closest('.dropdown');
            const isOpen = dropdown.classList.contains('is-open');

            closeDropdowns();

            if (!isOpen) {
                dropdown.classList.add('is-open');
                button.setAttribute('aria-expanded', 'true');
            }
        });
    });

    document.addEventListener('click', (event) => {
        if (!header) return;

        const clickedInsideHeader = header.contains(event.target);
        const clickedInsideDropdown = event.target.closest('.dropdown');

        if (!clickedInsideDropdown) {
            closeDropdowns();
        }

        if (!clickedInsideHeader) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            document.body.classList.remove('menu-open');
            if (header && navToggle) {
                header.classList.remove('nav-open');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.setAttribute('aria-label', 'Open navigation');
            }
        }
    });

    const navLinks = document.querySelectorAll('.navigation a');
    navLinks.forEach((link) => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 900) {
                closeMenu();
            } else if (!link.closest('.dropdown-content')) {
                closeDropdowns();
            }
        });
    });
});
