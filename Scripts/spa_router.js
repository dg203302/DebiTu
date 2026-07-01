(function() {
    if (window._spaRouterInitialized) return;
    window._spaRouterInitialized = true;

    document.addEventListener('click', async (e) => {
        const link = e.target.closest('.bottom-nav a');
        if (!link) return;
        
        const url = link.getAttribute('href');
        if (!url || url.startsWith('#') || url.startsWith('http')) return;
        if (url === window.location.pathname) {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        await navigateTo(url);
    });

    window.addEventListener('popstate', () => {
        navigateTo(window.location.pathname, true);
    });

    async function navigateTo(url, isPopState = false) {
        // Show loader
        const loader = document.getElementById('global-loader');
        if (loader) loader.classList.remove('hidden');

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Network response was not ok');
            const html = await res.text();
            
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');

            if (document.startViewTransition) {
                document.startViewTransition(() => updateDOM(newDoc, url, isPopState));
            } else {
                updateDOM(newDoc, url, isPopState);
            }
        } catch (err) {
            console.error('SPA Navigation Error:', err);
            window.location.href = url; // Fallback to normal navigation
        }
    }

    async function updateDOM(newDoc, url, isPopState) {
        // Update Title
        document.title = newDoc.title;

        // Reset body class to avoid leaking modal/drawer states
        document.body.className = newDoc.body.className;

        // Update CSS links
        const currentLinks = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));
        const newLinks = Array.from(newDoc.head.querySelectorAll('link[rel="stylesheet"]'));
        
        // Insert new links and wait for them to load
        const cssPromises = [];
        newLinks.forEach(newLink => {
            if (!currentLinks.some(l => l.getAttribute('href') === newLink.getAttribute('href'))) {
                const clone = newLink.cloneNode();
                const p = new Promise(resolve => {
                    clone.onload = resolve;
                    clone.onerror = resolve; // resolve anyway to avoid blocking forever
                });
                cssPromises.push(p);
                document.head.appendChild(clone);
            }
        });

        await Promise.all(cssPromises);

        // Remove old links
        currentLinks.forEach(currentLink => {
            if (!newLinks.some(l => l.getAttribute('href') === currentLink.getAttribute('href'))) {
                currentLink.remove();
            }
        });

        // Preserve elements
        const preserveSelectors = ['.liquid-container', '#global-loader', 'script[src*="spa_router.js"]'];
        
        // Remove old body elements that shouldn't be preserved
        Array.from(document.body.children).forEach(child => {
            const shouldPreserve = preserveSelectors.some(sel => child.matches && child.matches(sel));
            if (!shouldPreserve) {
                child.remove();
            }
        });

        // Insert new body elements
        Array.from(newDoc.body.children).forEach(child => {
            const isPreserved = preserveSelectors.some(sel => child.matches && child.matches(sel));
            if (!isPreserved && child.tagName !== 'SCRIPT') {
                document.body.appendChild(child.cloneNode(true));
            }
        });

        if (!isPopState) {
            history.pushState(null, '', url);
        }

        // Re-execute scripts
        const newScripts = Array.from(newDoc.querySelectorAll('script'));
        newScripts.forEach(script => {
            if (script.src && script.src.includes('spa_router.js')) return;
            if (script.textContent && script.textContent.includes('CMS_ANIM')) return;

            const newScript = document.createElement('script');
            if (script.src) {
                const sep = script.src.includes('?') ? '&' : '?';
                newScript.src = script.src + sep + 'spa=' + Date.now();
            } else {
                newScript.textContent = script.textContent;
            }
            if (script.type) newScript.type = script.type;
            
            document.body.appendChild(newScript);
        });
    }

    // Global style for docked bottom nav
    if (!document.getElementById('spa-router-styles')) {
        const style = document.createElement('style');
        style.id = 'spa-router-styles';
        style.textContent = `
            .bottom-nav { transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1); }
            .bottom-nav.bottom-nav--docked {
                bottom: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                border-radius: 0 !important;
                border-left: none !important;
                border-right: none !important;
                border-bottom: none !important;
                padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
                padding-top: 12px !important;
                background: var(--glass-bg, rgba(0,0,0,0.8)) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Global scroll listener for docking the bottom nav
    if (!window._bottomNavScrollAttached) {
        window._bottomNavScrollAttached = true;
        window.addEventListener('scroll', () => {
            const bottomNav = document.querySelector('.bottom-nav');
            if (!bottomNav) return;
            
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            const innerHeight = window.innerHeight;
            const scrollHeight = document.documentElement.scrollHeight;
            
            // Allow 2px margin of error to be strictly at the bottom
            const isAtBottom = Math.ceil(scrollY + innerHeight) >= scrollHeight - 2;
            
            if (isAtBottom) {
                bottomNav.classList.add('bottom-nav--docked');
            } else {
                bottomNav.classList.remove('bottom-nav--docked');
            }
        }, { passive: true });
    }
})();
