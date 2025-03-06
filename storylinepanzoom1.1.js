/**
 * StorylinePanzoom - A custom zoom library for Articulate Storyline objects
 * Optimized for Storyline's DOM structure
 */
const StorylinePanzoom = (function() {
    const instances = new Map();
    
    const defaultOptions = {
        maxScale: 5,
        minScale: 1,
        step: 0.3,
        duration: 200,
        easing: 'ease-in-out'
    };

    function findStorylineObject(accText) {
        // Find both the vector shape and acc-image elements
        const vectorShape = document.querySelector(`.slide-object-vectorshape[data-acc-text="${accText}"]`);
        const accImage = document.querySelector(`img.acc-image[aria-label="${accText}"]`);
        
        if (!vectorShape || !accImage) {
            console.error(`StorylinePanzoom: Could not find complete object set for "${accText}"`);
            return null;
        }

        return {
            vectorShape,
            accImage,
            maskable: vectorShape.querySelector('.slideobject-maskable'),
            svg: vectorShape.querySelector('svg'),
            svgImage: vectorShape.querySelector('svg image')
        };
    }

    function getTransformValues(transform) {
        const values = transform.match(/translate\((.*?)px,\s*(.*?)px\)\s*rotate\((.*?)deg\)\s*scale\((.*?),\s*(.*?)\)/);
        if (!values) return null;
        return {
            translateX: parseFloat(values[1]),
            translateY: parseFloat(values[2]),
            rotate: parseFloat(values[3]),
            scaleX: parseFloat(values[4]),
            scaleY: parseFloat(values[5])
        };
    }

    function initializeZoom(accText, customOptions = {}) {
        const options = { ...defaultOptions, ...customOptions };
        
        // Find Storyline elements
        const elements = findStorylineObject(accText);
        if (!elements) return null;

        const { vectorShape, accImage, maskable, svg, svgImage } = elements;
        
        // Store original states
        const originalState = {
            vectorTransform: vectorShape.style.transform,
            maskableTransform: maskable.style.transform,
            transformOrigin: vectorShape.style.transformOrigin,
            width: vectorShape.style.width,
            height: vectorShape.style.height,
            zIndex: vectorShape.style.zIndex
        };

        // Get original transform values
        const transformValues = getTransformValues(originalState.vectorTransform);
        if (!transformValues) return null;

        // Create zoom wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'storyline-panzoom-wrapper';
        wrapper.style.position = 'absolute';
        wrapper.style.width = originalState.width;
        wrapper.style.height = originalState.height;
        wrapper.style.zIndex = originalState.zIndex;
        wrapper.style.transformOrigin = originalState.transformOrigin;
        
        // Initialize Panzoom on the maskable div
        const panzoomInstance = Panzoom(maskable, {
            ...options,
            startScale: 1,
            startX: 0,
            startY: 0,
            setTransform: (elem, { scale, x, y }) => {
                // Apply zoom transform while maintaining original position
                const newTransform = `translate(${transformValues.translateX}px, ${transformValues.translateY}px) ` +
                                   `rotate(${transformValues.rotate}deg) ` +
                                   `scale(${transformValues.scaleX * scale}, ${transformValues.scaleY * scale})`;
                
                vectorShape.style.transform = newTransform;
                
                // Update acc-image position if needed
                if (accImage) {
                    accImage.style.transform = `scale(${scale})`;
                    accImage.style.transformOrigin = '0 0';
                }
            }
        });

        // Add event listeners
        maskable.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.deltaY < 0) panzoomInstance.zoomIn();
            else panzoomInstance.zoomOut();
        });

        // Add touch zoom support
        let startDist = 0;
        maskable.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                startDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            }
        }, { passive: true });

        maskable.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const currentDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                if (startDist > 0) {
                    const scale = panzoomInstance.getScale();
                    const newScale = scale * (currentDist / startDist);
                    panzoomInstance.zoom(newScale);
                    startDist = currentDist;
                }
            }
        });

        // Add touch pan support
        let lastX = 0;
        let lastY = 0;
        let isPanning = false;

        maskable.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isPanning = true;
                lastX = e.touches[0].pageX;
                lastY = e.touches[0].pageY;
            }
        }, { passive: true });

        maskable.addEventListener('touchmove', (e) => {
            if (isPanning && e.touches.length === 1) {
                const deltaX = e.touches[0].pageX - lastX;
                const deltaY = e.touches[0].pageY - lastY;
                
                panzoomInstance.pan(deltaX, deltaY);
                
                lastX = e.touches[0].pageX;
                lastY = e.touches[0].pageY;
            }
        });

        maskable.addEventListener('touchend', () => {
            isPanning = false;
            startDist = 0;
        });

        // Add double-tap to zoom
        let lastTap = 0;
        maskable.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 300 && tapLength > 0) {
                // Double tap detected
                e.preventDefault();
                const scale = panzoomInstance.getScale();
                
                if (scale > 1) {
                    // If zoomed in, zoom out to original size
                    panzoomInstance.reset();
                } else {
                    // If at original size, zoom in
                    panzoomInstance.zoom(2.5); // Zoom to 250%
                }
            }
            lastTap = currentTime;
        });

        // Prevent default touch behaviors
        maskable.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });

        // Store instance
        instances.set(accText, {
            panzoom: panzoomInstance,
            elements,
            originalState
        });

        return panzoomInstance;
    }

    function reset(accText) {
        const instance = instances.get(accText);
        if (!instance) return;

        const { panzoom, elements, originalState } = instance;
        
        // Reset zoom
        panzoom.reset();
        
        // Reset original transforms
        elements.vectorShape.style.transform = originalState.vectorTransform;
        elements.maskable.style.transform = originalState.maskableTransform;
        if (elements.accImage) {
            elements.accImage.style.transform = '';
        }
    }

    function destroy(accText) {
        const instance = instances.get(accText);
        if (!instance) return;

        reset(accText);
        instance.panzoom.destroy();
        instances.delete(accText);
    }

    // Initialize when Storyline loads


    function initAllObjects() {
        const objects = document.querySelectorAll('.slide-object-vectorshape[data-acc-text]');
        objects.forEach(obj => {
            const accText = obj.getAttribute('data-acc-text');
            initializeZoom(accText);
        });
    }

    // Public API
    return {
        init: initializeZoom,
        reset: reset,
        destroy: destroy,
        initAll: initAllObjects,
        getInstance: (accText) => instances.get(accText)?.panzoom
    };
})();

/* Guide
StorylinePanzoom.init('Lion', {
    maxScale: 4,
    minScale: 1
});*/

// Add initialization queue and ready state management
const StorylinePanzoomLoader = (function() {
    let isReady = false;
    const initQueue = [];
    
    function executeQueue() {
        while (initQueue.length > 0) {
            const init = initQueue.shift();
            try {
                StorylinePanzoom.init(init.accText, init.options);
            } catch (e) {
                console.error(`Failed to initialize StorylinePanzoom for "${init.accText}":`, e);
            }
        }
    }

    // Function to be called when library is ready
    function ready() {
        isReady = true;
        executeQueue();
    }

    // Safe initialization function
    function safeInit(accText, options = {}) {
        if (isReady) {
            return StorylinePanzoom.init(accText, options);
        } else {
            initQueue.push({ accText, options });
            return null;
        }
    }

    // Check if library is loaded every 100ms for up to 5 seconds
    let attempts = 0;
    const checkInterval = setInterval(() => {
        attempts++;
        if (typeof StorylinePanzoom !== 'undefined' && typeof Panzoom !== 'undefined') {
            clearInterval(checkInterval);
            ready();
        } else if (attempts >= 50) { // 5 seconds timeout
            clearInterval(checkInterval);
            console.error('StorylinePanzoom failed to initialize after 5 seconds');
        }
    }, 100);

    return {
        init: safeInit,
        isReady: () => isReady
    };
})();

// Replace the direct StorylinePanzoom global with a proxy that ensures library is loaded
window.StorylinePanzoom = new Proxy({}, {
    get: function(target, prop) {
        if (prop === 'init') {
            return StorylinePanzoomLoader.init;
        }
        return function(...args) {
            if (StorylinePanzoomLoader.isReady()) {
                return StorylinePanzoom[prop](...args);
            } else {
                console.warn(`StorylinePanzoom.${prop} called before library was ready`);
                return null;
            }
        };
    }
});