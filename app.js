document.addEventListener('DOMContentLoaded', () => {
    // Initialize PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

    const pdfContainer = document.getElementById('pdfContainer');
    const pdfInput = document.getElementById('pdfInput');
    const imageInput = document.getElementById('imageInput');
    let currentPDF = null;

    let currentZoom = 1;
    const MAX_ZOOM = 3;
    const MIN_ZOOM = 0.5;

    function applyZoom() {
        const canvas = pdfContainer.querySelector('canvas');
        if (canvas) {
            canvas.style.transform = `scale(${currentZoom})`;
            adjustContainerSize(canvas);
        }
    }

    function adjustContainerSize(canvas) {
        const scaledWidth = canvas.width * currentZoom;
        const scaledHeight = canvas.height * currentZoom;
        pdfContainer.style.minWidth = `${scaledWidth}px`;
        pdfContainer.style.minHeight = `${scaledHeight}px`;
    }

    async function renderPage(pageNumber) {
        const page = await currentPDF.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        pdfContainer.innerHTML = '';
        pdfContainer.appendChild(canvas);

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext);

        // Reset zoom when loading new page
        currentZoom = 1;
        applyZoom();

        // Enhanced pinch-zoom handling
        let initialDistance = 0;
        let initialZoom = 1;
        let lastZoom = 1;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialZoom = currentZoom;
                lastZoom = currentZoom;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const distance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );

                currentZoom = Math.min(Math.max(
                    initialZoom * (distance / initialDistance),
                    MIN_ZOOM
                ), MAX_ZOOM);

                if (currentZoom !== lastZoom) {
                    applyZoom();
                    lastZoom = currentZoom;
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            initialDistance = 0;
        });
    }

    async function loadPDF(arrayBuffer) {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        currentPDF = await loadingTask.promise;

        // Display first page by default
        renderPage(1);
    }

    function addImageToPDF(imageData) {
        const img = document.createElement('img');
        img.src = imageData;
        img.className = 'draggable-image';
        img.style.position = 'absolute';
        img.style.left = '50px';
        img.style.top = '50px';
        img.style.width = '100px';
        img.style.height = 'auto';
        img.style.zIndex = '1000';

        // Wait for image to load before adding to container
        img.onload = () => {
            pdfContainer.appendChild(img);
            // Initialize interact for this specific image
            initializeInteractForElement(img);
        };
    }

    function initializeInteractForElement(element) {
        interact(element)
            .draggable({
                inertia: false,
                autoScroll: true,
                // No restrictRect modifier used here
                listeners: {
                    move: dragMoveListener,
                    end: (event) => event.target.classList.remove('dragging')
                }
            })
            .resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                inertia: false,
                modifiers: [
                    interact.modifiers.restrictSize({
                        min: { width: 50, height: 50 }
                    })
                ],
                listeners: {
                    move: resizeMoveListener,
                    end: (event) => event.target.classList.remove('resizing')
                }
            })
            .on('dragstart', event => event.target.classList.add('dragging'))
            .on('resizestart', event => event.target.classList.add('resizing'));
    }
    function dragMoveListener(event) {
        const target = event.target;
        // Calculate new positions
        let x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        let y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        
        // Optional: clamp within pdfContainer boundaries
        const parentRect = pdfContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (targetRect.left + event.dx < parentRect.left) {
            x = 0;
        }
        if (targetRect.top + event.dy < parentRect.top) {
            y = 0;
        }
        if (targetRect.right + event.dx > parentRect.right) {
            x = parentRect.width - targetRect.width;
        }
        if (targetRect.bottom + event.dy > parentRect.bottom) {
            y = parentRect.height - targetRect.height;
        }
    
        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

    function resizeMoveListener(event) {
        const target = event.target;
        let x = parseFloat(target.getAttribute('data-x')) || 0;
        let y = parseFloat(target.getAttribute('data-y')) || 0;

        target.style.width = event.rect.width + 'px';
        target.style.height = event.rect.height + 'px';

        x += event.deltaRect.left;
        y += event.deltaRect.top;

        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

async function savePDFWithEdits() {
    try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([pdfContainer.offsetWidth, pdfContainer.offsetHeight]);

        // Draw the existing PDF content
        const pdfCanvas = pdfContainer.querySelector('canvas');
        if (!pdfCanvas) {
            console.error('No PDF canvas found');
            return;
        }
        const pdfImage = await pdfDoc.embedPng(pdfCanvas.toDataURL('image/png'));
        page.drawImage(pdfImage, {
            x: 0,
            y: 0,
            width: pdfContainer.offsetWidth,
            height: pdfContainer.offsetHeight
        });

        // Draw the images
        const images = pdfContainer.querySelectorAll('.draggable-image');
        for (const img of images) {
            const rect = img.getBoundingClientRect();
            let transformString = window.getComputedStyle(img).transform;
            if (!transformString || transformString === 'none') {
                transformString = 'matrix(1, 0, 0, 1, 0, 0)';
            }
            const transform = new WebKitCSSMatrix(transformString);
            
            // Read the initial position from CSS
            const initialLeft = parseFloat(img.style.left) || 0;
            const initialTop = parseFloat(img.style.top) || 0;
            
            // Effective position = initial CSS position + transform offset
            const effectiveX = initialLeft + (isNaN(transform.m41) ? 0 : transform.m41);
            const effectiveY = initialTop + (isNaN(transform.m42) ? 0 : transform.m42);
            
            const width = rect.width;
            const height = rect.height;
            
            let embeddedImage;
            if (img.src.startsWith('data:image/png')) {
                embeddedImage = await pdfDoc.embedPng(img.src);
            } else if (img.src.startsWith('data:image/jpeg') || img.src.startsWith('data:image/jpg')) {
                embeddedImage = await pdfDoc.embedJpg(img.src);
            } else {
                console.error('Unsupported image format:', img.src);
                continue;
            }
            
            page.drawImage(embeddedImage, {
                x: effectiveX,
                y: pdfContainer.offsetHeight - effectiveY - height, // adjust for PDF coordinate system
                width: width,
                height: height
            });
        }

        // Save the PDF
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'edited-pdf.pdf';
        downloadLink.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error saving PDF:', error);
    }
}
    document.getElementById('saveBtn').addEventListener('click', () => {
        savePDFWithEdits();
    });

    pdfInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const arrayBuffer = await file.arrayBuffer();
        loadPDF(arrayBuffer);
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && (file.type.startsWith('image/') || file.type === 'image/jpeg' || file.type === 'image/jpg')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target && event.target.result) {
                    addImageToPDF(event.target.result);
                    // saveToLocalStorage(event.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    });

    // function saveToLocalStorage(imageData) {
    //     const images = JSON.parse(localStorage.getItem('savedImages') || '[]');
    //     images.push(imageData);
    //     localStorage.setItem('savedImages', JSON.stringify(images));
    // }

    // function loadSavedImages() {
    //     const images = JSON.parse(localStorage.getItem('savedImages') || '[]');
    //     images.forEach(imageData => {
    //         addImageToPDF(imageData);
    //     });
    // }

    // loadSavedImages();

    document.addEventListener('touchmove', function(e) {
        if (e.target.classList.contains('draggable-image')) {
            e.preventDefault();
        }
    }, { passive: false });

    document.body.addEventListener('touchstart', function(e) {
        if (e.target.classList.contains('draggable-image')) {
            e.preventDefault();
        }
    }, { passive: false });
});