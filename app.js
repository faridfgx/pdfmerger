document.addEventListener('DOMContentLoaded', () => {
    // State management
    let files = [];
    let undoStack = [];
    let redoStack = [];
    
    // Constants
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB total limit

    // DOM Elements
    const fileList = document.getElementById("file-list");
    const dropZone = document.getElementById("drop-zone");
    const mergeBtn = document.querySelector(".merge-btn");
    const pdfInput = document.getElementById("pdfInput");

    // Initialize event listeners
    initializeEventListeners();

    // Utility Functions
    function showToast(message, type = 'info') {
        Toastify({
            text: message,
            duration: 3000,
            gravity: "top",
            position: "right",
            backgroundColor: type === 'error' ? '#ff7675' : 
                           type === 'success' ? '#00b894' : '#74b9ff',
            stopOnFocus: true
        }).showToast();
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // File Validation
    async function validatePDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            await PDFLib.PDFDocument.load(arrayBuffer);
            return true;
        } catch (error) {
            showToast(`${file.name} appears to be corrupted or invalid`, 'error');
            return false;
        }
    }

    // Event Listeners Setup
    function initializeEventListeners() {
        // File input change
        pdfInput.addEventListener("change", (event) => {
            addFiles(event.target.files);
        });

        // Drag and drop
        dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener("drop", (event) => {
            event.preventDefault();
            dropZone.classList.remove('dragover');
            dropZone.classList.add('drop-pulse');
            setTimeout(() => dropZone.classList.remove('drop-pulse'), 300);
            addFiles(event.dataTransfer.files);
        });

        // Compression checkbox
        document.getElementById('compressOutput').addEventListener('change', updateEstimatedSize);

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    // File List Management
    async function addFiles(newFiles) {
        const progressWrapper = document.querySelector('.progress-wrapper');
        progressWrapper.style.display = 'block';
        
        let totalSize = files.reduce((sum, file) => sum + file.size, 0);
        
        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i];
            const progress = ((i + 1) / newFiles.length) * 100;
            updateProgress(progress);

            if (file.type !== "application/pdf") {
                showToast(`${file.name} is not a PDF file`, 'error');
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                showToast(`${file.name} exceeds 50MB limit`, 'error');
                continue;
            }

            if (totalSize + file.size > MAX_TOTAL_SIZE) {
                showToast('Total file size exceeds 100MB limit', 'error');
                break;
            }

            if (await validatePDF(file)) {
                totalSize += file.size;
                files.push(file);
                undoStack.push({ action: 'add', file });
                showToast(`Added ${file.name}`, 'success');
            }
        }

        updateFileList();
        updateEstimatedSize();
        progressWrapper.style.display = 'none';
    }

    function updateFileList() {
        fileList.innerHTML = "";
        files.forEach((file, index) => {
            const listItem = createFileListItem(file, index);
            fileList.appendChild(listItem);
        });

        if (files.length > 0) {
            initializeSortable();
        }
    }

    function createFileListItem(file, index) {
        const listItem = document.createElement("li");
        listItem.className = "file-item";

        const position = document.createElement("div");
        position.className = "position-indicator";
        position.textContent = index + 1;

        const dragHandle = document.createElement("div");
        dragHandle.className = "drag-handle";
        dragHandle.innerHTML = "⋮⋮";
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "file-name";
        nameSpan.textContent = file.name;
        
        const sizeSpan = document.createElement("span");
        sizeSpan.className = "file-size";
        sizeSpan.textContent = formatFileSize(file.size);
        
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "Remove";
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            removeFile(index);
        };
        
        listItem.appendChild(position);
        listItem.appendChild(dragHandle);
        listItem.appendChild(nameSpan);
        listItem.appendChild(sizeSpan);
        listItem.appendChild(removeBtn);
        
        return listItem;
    }

    function initializeSortable() {
        new Sortable(fileList, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            handle: '.drag-handle',
            onEnd: (event) => {
                const movedItem = files.splice(event.oldIndex, 1)[0];
                files.splice(event.newIndex, 0, movedItem);
                updateFileList();
                undoStack.push({
                    action: 'move',
                    from: event.oldIndex,
                    to: event.newIndex,
                    file: movedItem
                });
            }
        });
    }

    // Progress and Status Updates
    function updateProgress(percent) {
        const progressBar = document.querySelector('.progress-bar');
        progressBar.style.width = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
    }

    function updateEstimatedSize() {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const compressionFactor = document.getElementById('compressOutput').checked ? 0.7 : 1;
        const estimatedSize = totalSize * compressionFactor;
        document.getElementById('estimatedSize').textContent = formatFileSize(estimatedSize);
    }

    // Undo/Redo Functionality
    function handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault();
                redo();
            }
        }
    }

    function undo() {
        if (undoStack.length === 0) return;
        
        const action = undoStack.pop();
        redoStack.push(action);
        
        if (action.action === 'add') {
            const index = files.findIndex(f => f === action.file);
            if (index !== -1) {
                files.splice(index, 1);
            }
        } else if (action.action === 'remove') {
            files.splice(action.index, 0, action.file);
        } else if (action.action === 'move') {
            const movedItem = files.splice(action.to, 1)[0];
            files.splice(action.from, 0, movedItem);
        }
        
        updateFileList();
        updateEstimatedSize();
        showToast('Undo successful');
    }

    function redo() {
        if (redoStack.length === 0) return;
        
        const action = redoStack.pop();
        undoStack.push(action);
        
        if (action.action === 'add') {
            files.push(action.file);
        } else if (action.action === 'remove') {
            files.splice(action.index, 1);
        } else if (action.action === 'move') {
            const movedItem = files.splice(action.from, 1)[0];
            files.splice(action.to, 0, movedItem);
        }
        
        updateFileList();
        updateEstimatedSize();
        showToast('Redo successful');
    }

    function removeFile(index) {
        const removedFile = files.splice(index, 1)[0];
        undoStack.push({
            action: 'remove',
            index: index,
            file: removedFile
        });
        updateFileList();
        updateEstimatedSize();
        showToast(`Removed ${removedFile.name}`);
    }

    // PDF Merging

async function mergePDFs() {
    if (files.length < 2) {
        showToast("Please add at least two PDFs.", 'error');
        return;
    }

    try {
        mergeBtn.classList.add('loading');
        mergeBtn.disabled = true;

        const mergedPdf = await PDFLib.PDFDocument.create();
        const compress = document.getElementById('compressOutput').checked;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            updateProgress((i + 1) / files.length * 100);
            
            const bytes = await file.arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(bytes);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        // Save the merged PDF without encryption
        const mergedPdfBytes = await mergedPdf.save({
            useObjectStreams: compress
        });

        const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "merged.pdf";
        link.click();

        showToast("PDFs merged successfully!", 'success');
        
        if (confirm("Would you like to clear the file list?")) {
            files = [];
            updateFileList();
            showToast("File list cleared");
        }
    } catch (error) {
        showToast('Error merging PDFs: ' + error.message, 'error');
        console.error('Merge error:', error);
    } finally {
        mergeBtn.classList.remove('loading');
        mergeBtn.disabled = false;
        updateProgress(0);
    }
}


    // Expose necessary functions to global scope
    window.mergePDFs = mergePDFs;
});