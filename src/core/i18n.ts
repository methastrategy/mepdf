export type Language = 'th' | 'en';

export const translations = {
  en: {
    // Brand
    brandName: 'mePDF',
    brandBadge: 'Pure Client-Side',

    // Navbar
    tabStudio: 'Visual Studio (Merge & Organize)',
    tabSplit: 'Split PDF',
    tabCompress: 'Compress',
    tabProtect: 'Protect PDF',
    tabWatermark: 'Watermark',
    tabNumbering: 'Page Numbers',
    tabMetadata: 'Metadata',
    tabImg2Pdf: 'Images to PDF',
    tabPdf2Img: 'PDF to Images',
    tabExtractText: 'Extract Text',
    navInstall: 'Install App',
    navExport: 'Export PDF',
    navExportCount: 'Export PDF ({count})',

    // Dropzone
    dropzoneTitle: 'Drop PDF or Image files here',
    dropzoneDesc:
      'Organize, merge, rotate, split, or compress your documents instantly. All operations happen 100% in your browser.',
    dropzoneSelectBtn: 'Select Files',
    dropzoneZeroUpload: 'Zero server upload • 100% Private',
    dropzoneUnlimitedSize: 'Unlimited File Size',
    dropzoneSupportedFormats: 'PDF, JPG, PNG, WebP',
    dropzoneForTool: 'Drop PDF here to use {tool}',

    // Toolbar
    toolbarPagesCount: '{count} pages',
    toolbarSinglePage: '1 page',
    toolbarSelectedOfTotal: '{selected} of {total} selected',
    toolbarSelectAll: 'Select All',
    toolbarDeselectAll: 'Deselect All',
    toolbarInvert: 'Invert',
    toolbarRotateAll: 'Rotate All',
    toolbarRotateSelected: 'Rotate Selected',
    toolbarSplit: 'Split',
    toolbarDeleteSelected: 'Delete Selected',
    toolbarAddFiles: 'Add Files',
    toolbarClearAll: 'Clear All',

    // Cards
    cardMoveLeft: 'Move left',
    cardMoveRight: 'Move right',
    cardRotateCw: 'Rotate 90° clockwise',
    cardZoomPreview: 'Zoom Preview (Double-click)',
    cardDragReorder: 'Drag to reorder',
    cardDeletePage: 'Delete this page',
    cardPagePrefix: 'P.{num}',

    // Clear confirmation modal
    clearModalTitle: 'Clear Workspace',
    clearModalDesc:
      'Are you sure you want to clear all pages from the workspace? All uploaded documents and edits will be removed.',
    clearModalConfirm: 'Clear All',
    clearModalCancel: 'Cancel',

    // Split modal
    splitModalTitle: 'Split Document',
    splitModeLabel: 'Split Mode',
    splitModeEach: 'Extract every page into a separate PDF',
    splitModeRanges: 'Custom page ranges (e.g. 1-3, 4-6, 7)',
    splitModeSelected: 'Extract only selected pages ({count} pages)',
    splitRangesLabel: 'Page Ranges',
    splitRangesPlaceholder: 'e.g. 1-2, 3-5, 6',
    splitRangesHint: 'Separate individual parts by commas or semicolons.',
    splitBtn: 'Split & Download ZIP',

    // Compress modal
    compressModalTitle: 'Smart PDF Compression',
    compressModalDesc:
      'Downsamples high-resolution scanned graphics and optimizes page structures directly in your browser with zero server upload.',
    compressPresetLabel: 'Compression Preset',
    compressPresetScreen: 'Screen',
    compressPresetScreenDesc: '96 DPI • Maximum savings',
    compressPresetEbook: 'Ebook',
    compressPresetEbookDesc: '150 DPI • Balanced sharpness',
    compressPresetPrint: 'Print',
    compressPresetPrintDesc: '300 DPI • High quality print',
    compressQualitySlider: 'Quality Slider',
    compressMaxSavings: 'Maximum Compression (10%)',
    compressBalanced: 'Balanced (75%)',
    compressMaxQuality: 'Maximum Quality (95%)',
    compressCurrentSize: 'Current File Size',
    compressOptimizedSize: 'Optimized Size',
    compressTargetDpi: 'Target DPI: {dpi} DPI',
    compressEstSavings: 'Estimated savings: ~40% - 75%',
    compressSavedInfo: 'Saved {saved} ({percent}% smaller)',
    compressAlreadyOptimal: 'File is already well-optimized (no further reduction possible)',
    compressStartBtn: 'Compress Now',
    compressDownloadBtn: 'Download Compressed',

    // Protect modal
    protectModalTitle: 'Protect PDF with Password',
    protectModalDesc: 'Encrypt your PDF with standard security directly in your browser. Anyone opening the file must enter this password.',
    protectPasswordLabel: 'Document Password',
    protectPasswordConfirmLabel: 'Confirm Password',
    protectPasswordPlaceholder: 'Enter password (min 3 chars)',
    protectPasswordConfirmPlaceholder: 'Re-enter password to verify',
    protectShowPassword: 'Show password',
    protectHidePassword: 'Hide password',
    protectBtn: 'Protect & Download',
    toastProtectSuccess: 'PDF protected and downloaded successfully!',
    toastPasswordMismatch: 'Passwords do not match',
    toastPasswordMinLength: 'Password must be at least 3 characters',

    // Watermark modal
    watermarkModalTitle: 'Add Watermark to PDF',
    watermarkModalDesc: 'Stamp custom text or image watermark directly onto PDF pages in your browser.',
    watermarkTypeLabel: 'Watermark Type',
    watermarkTypeText: 'Text Watermark',
    watermarkTypeImage: 'Logo Image',
    watermarkTextLabel: 'Watermark Text',
    watermarkTextPlaceholder: 'e.g. CONFIDENTIAL, DRAFT, SAMPLE',
    watermarkOpacityLabel: 'Opacity',
    watermarkRotationLabel: 'Rotation',
    watermarkRotationDiagonal: '45° Diagonal',
    watermarkRotationHorizontal: '0° Horizontal',
    watermarkRotationVertical: '90° Vertical',
    watermarkPositionLabel: 'Position',
    watermarkPositionCenter: 'Center',
    watermarkPositionTopCenter: 'Top Center',
    watermarkPositionBottomCenter: 'Bottom Center',
    watermarkPositionTopLeft: 'Top Left',
    watermarkPositionTopRight: 'Top Right',
    watermarkPositionBottomLeft: 'Bottom Left',
    watermarkPositionBottomRight: 'Bottom Right',
    watermarkColorLabel: 'Color',
    watermarkColorGray: 'Gray',
    watermarkColorRed: 'Red',
    watermarkColorBlue: 'Blue',
    watermarkColorBlack: 'Black',
    watermarkSizeLabel: 'Font Size',
    watermarkSizeSmall: 'Small (28px)',
    watermarkSizeMedium: 'Medium (48px)',
    watermarkSizeLarge: 'Large (72px)',
    watermarkImageLabel: 'Upload Logo Image',
    watermarkImageHint: 'Select PNG, JPG, or WebP logo file',
    watermarkBtn: 'Apply Watermark & Download',
    toastWatermarkSuccess: 'Watermark applied and downloaded successfully!',

    // Page Numbering modal
    numberingModalTitle: 'Add Page Numbers to PDF',
    numberingModalDesc: 'Stamp clean, formatted page numbers automatically onto each page of your document.',
    numberingFormatLabel: 'Numbering Format',
    numberingFormatPageNOfTotal: 'Page 1 of 10',
    numberingFormatPageN: 'Page 1',
    numberingFormatNumberOnly: '1, 2, 3',
    numberingFormatSlash: '1 / 10',
    numberingFormatCustom: 'Custom Template',
    numberingCustomPlaceholder: 'e.g. Page {n} of {total} or P.{n}',
    numberingPositionLabel: 'Position',
    numberingPositionBottomCenter: 'Bottom Center (Standard)',
    numberingPositionBottomRight: 'Bottom Right',
    numberingPositionBottomLeft: 'Bottom Left',
    numberingPositionTopCenter: 'Top Center',
    numberingPositionTopRight: 'Top Right',
    numberingPositionTopLeft: 'Top Left',
    numberingSkipCoverLabel: 'Skip First Page (Cover page)',
    numberingSizeLabel: 'Font Size',
    numberingSizeSmall: 'Small (9pt)',
    numberingSizeRegular: 'Regular (11pt)',
    numberingSizeLarge: 'Large (14pt)',
    numberingMarginLabel: 'Margin from Edge',
    numberingMarginCompact: 'Compact (18pt)',
    numberingMarginStandard: 'Standard (28pt)',
    numberingMarginWide: 'Wide (42pt)',
    numberingBtn: 'Add Page Numbers & Download',
    toastNumberingSuccess: 'Page numbers added and downloaded successfully!',

    // Metadata modal
    metadataModalTitle: 'PDF Metadata & Privacy',
    metadataModalDesc: 'Inspect, sanitize, or edit document metadata to protect your privacy before sharing.',
    metadataQuickSanitizeBtn: 'Sanitize All (1-Click Privacy Clean)',
    metadataTitleLabel: 'Document Title',
    metadataAuthorLabel: 'Author / Creator',
    metadataSubjectLabel: 'Subject',
    metadataKeywordsLabel: 'Keywords (comma-separated)',
    metadataCreatorLabel: 'Creator Application',
    metadataProducerLabel: 'PDF Producer',
    metadataCleanHint: 'Sanitizing clears author, application name, and device traces completely.',
    metadataSaveBtn: 'Save Metadata & Download',
    toastMetadataSanitized: 'Metadata sanitized and cleaned completely!',
    toastMetadataSaved: 'Metadata updated and downloaded successfully!',

    // PDF to Images modal
    pdf2imgModalTitle: 'Convert PDF Pages to Images',
    pdf2imgModalDesc: 'Render and extract each page as high-resolution PNG or JPG image.',
    pdf2imgFormatLabel: 'Image Format',
    pdf2imgDpiLabel: 'Resolution (DPI)',
    pdf2imgBtn: 'Extract & Download ZIP',

    // Images to PDF modal
    img2pdfModalTitle: 'Convert Images to PDF',
    img2pdfModalDesc: 'Combine multiple JPG, PNG, WebP images into a single clean PDF document.',
    img2pdfSizingLabel: 'Page Sizing',
    img2pdfFitA4: 'Fit to standard A4 (Centered)',
    img2pdfFitOriginal: 'Preserve image original dimensions',
    img2pdfSelectBtn: 'Select Images',
    img2pdfConvertBtn: 'Convert & Add to Studio',

    // Extract text modal
    extractTextModalTitle: 'Extract Selectable Text',
    extractTextCopyBtn: 'Copy Text',
    extractTextCopiedBtn: 'Copied!',
    extractTextDownloadBtn: 'Download .txt',
    extractTextEmpty: '[No selectable text found in this document]',

    // Password modal
    passwordModalTitle: 'Password Protected PDF',
    passwordModalDesc: 'Enter the document password to open {name}:',
    passwordPlaceholder: 'Document password',
    passwordUnlockBtn: 'Unlock & Import',

    // Lightbox modal
    lightboxTitle: 'High-Resolution Page Preview',
    lightboxFineTextHint: 'Crisp vector rendering for fine text, legal contracts, and architectural blueprints',
    lightboxZoomIn: 'Zoom In (+)',
    lightboxZoomOut: 'Zoom Out (-)',
    lightboxResetZoom: 'Reset Zoom (100%)',
    lightboxFitPage: 'Fit to Screen',
    lightboxPrevPage: 'Previous Page (←)',
    lightboxNextPage: 'Next Page (→)',
    lightboxRotate: 'Rotate 90° (R)',
    lightboxClose: 'Close (Esc)',
    lightboxPageCounter: 'Page {current} of {total}',

    // Toasts & Alerts
    toastSessionRestored: 'Restored previous session',
    toastWorkspaceCleared: 'Workspace cleared',
    toastImportSuccess: 'Imported {count} pages successfully!',
    toastExportSuccess: 'Exported {count} pages successfully!',
    toastSelectDocFirst: 'Please select a PDF document first.',
    toastUploadPdfOrImg: 'Please upload PDF or Image files.',
    toastMinPagesToSplit: 'At least 2 pages are required to split.',
    toastNoPagesToExport: 'No pages to export.',
    toastPageRemoved: 'Page removed',
    toastPagesRemoved: 'Removed {count} pages',
    toastUndo: 'Undo',
    toastPagesRestored: 'Restored {count} pages!',
    toastRotatedAll: 'Rotated all {count} pages (+{deg}°)',
    toastRotatedSelected: 'Rotated {count} selected pages (+{deg}°)',
    toastAppInstalled: 'mePDF installed successfully!',
    toastOfflineReady: 'mePDF is installed and ready for offline use!',
    toastOfflineActive: 'Offline mode active. All mePDF tools work 100% locally!',
    toastOnlineActive: 'Internet connection restored.',
    toastLanguageSwitched: 'Switched language to English',

    // Auth & Account
    authModalTitleSignIn: 'Sign In to mePDF',
    authModalTitleSignUp: 'Create mePDF Account',
    authTabSignIn: 'Sign In',
    authTabSignUp: 'Sign Up',
    authGoogleBtn: 'Continue with Google',
    authOrDivider: 'or',
    authMagicLinkDesc: 'Sign in passwordless with a magic link sent to your email',
    authEmailPlaceholder: 'name@example.com',
    authSendMagicLinkBtn: 'Send Magic Link',
    authMagicLinkSent: 'Magic link sent! Check your inbox.',
    authPasswordLabel: 'Password',
    authPasswordPlaceholder: '••••••••',
    authFullNameLabel: 'Full Name',
    authFullNamePlaceholder: 'e.g. Jane Doe',
    authSignInBtn: 'Sign In',
    authSignUpBtn: 'Create Account',
    authSignOutBtn: 'Sign Out',
    authSignedOutToast: 'Signed out successfully',
    authSignedInToast: 'Welcome back, {name}!',
    authRegisteredToast: 'Account created successfully!',
    authErrorGeneric: 'Authentication failed. Please check your credentials.',
    authSignInPrompt: 'Sign in to access Cloud Library and save your documents across devices.',
    authNeedAccount: "Don't have an account? Sign Up",
    authAlreadyAccount: 'Already have an account? Sign In',

    // Account Widget & Tiers
    accountBtnLabel: 'Account',
    accountSignInBtn: 'Sign In',
    accountTierFree: 'FREE',
    accountTierPro: 'PRO',
    accountStorageUsed: '{used} of {limit} used',
    accountMyDocuments: 'My Cloud Documents',
    accountUpgradePro: 'Upgrade to Pro (10 GB)',
    accountProActive: 'Pro Plan Active',
    accountProUnlimited: 'Pro Member',

    // Cloud Library
    cloudLibTitle: 'Cloud Document Library',
    cloudLibDesc: 'Securely sync, organize, and access your PDFs anywhere with 30-day auto-expiry or permanent pinning.',
    cloudLibSearchPlaceholder: 'Search documents...',
    cloudLibEmpty: 'No documents in your cloud library yet.',
    cloudLibEmptySub: 'Edit a PDF in Visual Studio and click "Save to Cloud" to sync your files.',
    cloudLibOpenStudio: 'Open in Studio',
    cloudLibDownload: 'Download',
    cloudLibShare: 'Share Link',
    cloudLibDelete: 'Delete',
    cloudLibDeleteConfirm: 'Are you sure you want to delete this document from the cloud? This action cannot be undone.',
    cloudLibPinned: 'Pinned (Permanent)',
    cloudLibExpiresIn: 'Expires in {days}d',
    cloudLibExpiresToday: 'Expires today',
    cloudLibPinBtn: 'Pin Document',
    cloudLibUnpinBtn: 'Unpin Document',
    cloudLibShareCopied: 'Share link copied to clipboard!',
    cloudLibDeleted: 'Document deleted from cloud',
    cloudLibLoadingDoc: 'Opening document in Visual Studio...',
    cloudLibDocCount: '{count} documents',

    // Save to Cloud Modal
    saveCloudTitle: 'Save to Cloud Vault',
    saveCloudDesc: 'Save your workspace PDF to the cloud for cross-device access.',
    saveCloudFilenameLabel: 'Document Filename',
    saveCloudPages: '{count} pages',
    saveCloudPinOption: 'Pin document (Bypass 30-day auto-expiry)',
    saveCloudQuotaLabel: 'Storage Quota',
    saveCloudQuotaRemaining: '{remaining} remaining of {limit}',
    saveCloudExceeded: 'Not enough storage quota. Please delete older files or upgrade to Pro.',
    saveCloudBtn: 'Save to Cloud',
    saveCloudSaving: 'Uploading to cloud...',
    saveCloudSuccess: 'Saved "{name}" to cloud library!',
    saveCloudBtnToolbar: 'Save to Cloud',
  },
  th: {
    // Brand
    brandName: 'mePDF',
    brandBadge: 'ประมวลผลบนเครื่อง 100%',

    // Navbar
    tabStudio: 'Visual Studio (รวมและจัดหน้า)',
    tabSplit: 'แยกหน้า PDF',
    tabCompress: 'บีบอัดไฟล์',
    tabProtect: 'ล็อกรหัสผ่าน',
    tabWatermark: 'ใส่ลายน้ำ',
    tabNumbering: 'รันเลขหน้า',
    tabMetadata: 'ข้อมูลเอกสาร',
    tabImg2Pdf: 'รูปภาพเป็น PDF',
    tabPdf2Img: 'PDF เป็นรูปภาพ',
    tabExtractText: 'ดึงข้อความ',
    navInstall: 'ติดตั้งแอป',
    navExport: 'ส่งออก PDF',
    navExportCount: 'ส่งออก PDF ({count})',

    // Dropzone
    dropzoneTitle: 'ลากไฟล์ PDF หรือรูปภาพมาวางที่นี่',
    dropzoneDesc:
      'จัดเรียง รวม หมุน แยก หรือบีบอัดเอกสารได้ทันที ทำงานบนเบราว์เซอร์ของคุณ 100% ไม่ส่งข้อมูลออกไปภายนอก',
    dropzoneSelectBtn: 'เลือกไฟล์',
    dropzoneZeroUpload: 'ไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์ • ปลอดภัย 100%',
    dropzoneUnlimitedSize: 'ไม่จำกัดขนาดไฟล์',
    dropzoneSupportedFormats: 'PDF, JPG, PNG, WebP',
    dropzoneForTool: 'วางไฟล์ PDF เพื่อใช้งาน {tool}',

    // Toolbar
    toolbarPagesCount: '{count} หน้า',
    toolbarSinglePage: '1 หน้า',
    toolbarSelectedOfTotal: 'เลือก {selected} จาก {total} หน้า',
    toolbarSelectAll: 'เลือกทั้งหมด',
    toolbarDeselectAll: 'ยกเลิกการเลือก',
    toolbarInvert: 'สลับการเลือก',
    toolbarRotateAll: 'หมุนทั้งหมด',
    toolbarRotateSelected: 'หมุนหน้าที่เลือก',
    toolbarSplit: 'แยกไฟล์',
    toolbarDeleteSelected: 'ลบหน้าที่เลือก',
    toolbarAddFiles: 'เพิ่มไฟล์',
    toolbarClearAll: 'ล้างทั้งหมด',

    // Cards
    cardMoveLeft: 'ย้ายไปซ้าย',
    cardMoveRight: 'ย้ายไปขวา',
    cardRotateCw: 'หมุนตามเข็ม 90°',
    cardZoomPreview: 'ดูตัวอย่างขยาย (ดับเบิลคลิก)',
    cardDragReorder: 'ลากเพื่อจัดลำดับ',
    cardDeletePage: 'ลบหน้านี้',
    cardPagePrefix: 'หน้า {num}',

    // Clear confirmation modal
    clearModalTitle: 'ล้างพื้นที่ทำงาน',
    clearModalDesc:
      'คุณแน่ใจหรือไม่ว่าต้องการล้างทุกหน้าออกจากพื้นที่ทำงาน? เอกสารและการแก้ไขทั้งหมดจะถูกลบออก',
    clearModalConfirm: 'ล้างทั้งหมด',
    clearModalCancel: 'ยกเลิก',

    // Split modal
    splitModalTitle: 'แยกหน้าเอกสาร',
    splitModeLabel: 'โหมดการแยก',
    splitModeEach: 'แยกทุกหน้าเป็นไฟล์ PDF เดี่ยว',
    splitModeRanges: 'กำหนดช่วงหน้า (เช่น 1-3, 4-6, 7)',
    splitModeSelected: 'แยกเฉพาะหน้าที่เลือกไว้ ({count} หน้า)',
    splitRangesLabel: 'ช่วงของหน้า',
    splitRangesPlaceholder: 'เช่น 1-2, 3-5, 6',
    splitRangesHint: 'คั่นแต่ละช่วงด้วยเครื่องหมายจุลภาค (,) หรืออัฒภาค (;)',
    splitBtn: 'แยกไฟล์และดาวน์โหลด ZIP',

    // Compress modal
    compressModalTitle: 'บีบอัด PDF อัจฉริยะ',
    compressModalDesc:
      'ลดขนาดภาพสแกนความละเอียดสูงและปรับโครงสร้างหน้าบนเบราว์เซอร์ของคุณโดยตรง ไม่มีการส่งไฟล์ขึ้นเซิร์ฟเวอร์',
    compressPresetLabel: 'รูปแบบการบีบอัด',
    compressPresetScreen: 'หน้าจอ (Screen)',
    compressPresetScreenDesc: '96 DPI • ลดขนาดสูงสุด',
    compressPresetEbook: 'อีบุ๊ก (Ebook)',
    compressPresetEbookDesc: '150 DPI • คมชัดสมดุล',
    compressPresetPrint: 'งานพิมพ์ (Print)',
    compressPresetPrintDesc: '300 DPI • คุณภาพสูงสำหรับพิมพ์',
    compressQualitySlider: 'ระดับคุณภาพ',
    compressMaxSavings: 'บีบอัดสูงสุด (10%)',
    compressBalanced: 'สมดุล (75%)',
    compressMaxQuality: 'คุณภาพสูงสุด (95%)',
    compressCurrentSize: 'ขนาดไฟล์ปัจจุบัน',
    compressOptimizedSize: 'ขนาดหลังบีบอัด',
    compressTargetDpi: 'DPI เป้าหมาย: {dpi} DPI',
    compressEstSavings: 'ประมาณการลดขนาด: ~40% - 75%',
    compressSavedInfo: 'ประหยัดพื้นที่ {saved} (เล็กลง {percent}%)',
    compressAlreadyOptimal: 'ไฟล์มีขนาดกะทัดรัดอยู่แล้ว (ไม่สามารถลดขนาดลงได้อีก)',
    compressStartBtn: 'บีบอัดทันที',
    compressDownloadBtn: 'ดาวน์โหลดไฟล์บีบอัด',

    // Protect modal
    protectModalTitle: 'ล็อกรหัสผ่านเอกสาร PDF',
    protectModalDesc: 'เข้ารหัสเอกสาร PDF ด้วยมาตรฐานความปลอดภัยสากล ทำงานบนเครื่องของคุณ 100% ผู้ที่เปิดไฟล์ต้องใส่รหัสผ่านนี้จึงจะอ่านได้',
    protectPasswordLabel: 'รหัสผ่านเปิดเอกสาร',
    protectPasswordConfirmLabel: 'ยืนยันรหัสผ่านอีกครั้ง',
    protectPasswordPlaceholder: 'ใส่รหัสผ่าน (อย่างน้อย 3 ตัวอักษร)',
    protectPasswordConfirmPlaceholder: 'พิมพ์รหัสผ่านเดิมซ้ำเพื่อยืนยัน',
    protectShowPassword: 'แสดงรหัสผ่าน',
    protectHidePassword: 'ซ่อนรหัสผ่าน',
    protectBtn: 'ล็อกรหัสและดาวน์โหลด',
    toastProtectSuccess: 'ล็อกรหัสผ่านและดาวน์โหลด PDF สำเร็จแล้ว!',
    toastPasswordMismatch: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน',
    toastPasswordMinLength: 'รหัสผ่านต้องมีความยาวอย่างน้อย 3 ตัวอักษร',

    // Watermark modal
    watermarkModalTitle: 'ใส่ลายน้ำลงในเอกสาร PDF',
    watermarkModalDesc: 'ประทับลายน้ำข้อความหรือรูปภาพลงบนเอกสาร PDF โดยตรงในเบราว์เซอร์ของคุณ',
    watermarkTypeLabel: 'ประเภทลายน้ำ',
    watermarkTypeText: 'ลายน้ำข้อความ',
    watermarkTypeImage: 'ภาพโลโก้',
    watermarkTextLabel: 'ข้อความลายน้ำ',
    watermarkTextPlaceholder: 'เช่น สำเนาถูกต้อง, DRAFT, CONFIDENTIAL',
    watermarkOpacityLabel: 'ความโปร่งแสง',
    watermarkRotationLabel: 'มุมเอียง',
    watermarkRotationDiagonal: 'เอียง 45° (แนวทแยง)',
    watermarkRotationHorizontal: 'แนวนอน 0°',
    watermarkRotationVertical: 'แนวตั้ง 90°',
    watermarkPositionLabel: 'ตำแหน่ง',
    watermarkPositionCenter: 'กึ่งกลางหน้า',
    watermarkPositionTopCenter: 'กึ่งกลางด้านบน',
    watermarkPositionBottomCenter: 'กึ่งกลางด้านล่าง',
    watermarkPositionTopLeft: 'มุมบนซ้าย',
    watermarkPositionTopRight: 'มุมบนขวา',
    watermarkPositionBottomLeft: 'มุมล่างซ้าย',
    watermarkPositionBottomRight: 'มุมล่างขวา',
    watermarkColorLabel: 'สีลายน้ำ',
    watermarkColorGray: 'สีเทา',
    watermarkColorRed: 'สีแดง',
    watermarkColorBlue: 'สีน้ำเงิน',
    watermarkColorBlack: 'สีดำ',
    watermarkSizeLabel: 'ขนาดข้อความ',
    watermarkSizeSmall: 'เล็ก (28px)',
    watermarkSizeMedium: 'ปานกลาง (48px)',
    watermarkSizeLarge: 'ใหญ่ (72px)',
    watermarkImageLabel: 'อัปโหลดภาพโลโก้',
    watermarkImageHint: 'เลือกไฟล์ภาพโลโก้ PNG, JPG หรือ WebP',
    watermarkBtn: 'ประทับลายน้ำและดาวน์โหลด',
    toastWatermarkSuccess: 'ประทับลายน้ำและดาวน์โหลด PDF สำเร็จแล้ว!',

    // Page Numbering modal
    numberingModalTitle: 'รันเลขหน้าเอกสาร PDF',
    numberingModalDesc: 'ใส่วันที่และหมายเลขหน้าอัตโนมัติ จัดตำแหน่งและรูปแบบได้ตามต้องการ',
    numberingFormatLabel: 'รูปแบบเลขหน้า',
    numberingFormatPageNOfTotal: 'หน้า 1 จาก 10 (Page 1 of N)',
    numberingFormatPageN: 'หน้า 1 (Page N)',
    numberingFormatNumberOnly: '1, 2, 3 (ตัวเลขเดี่ยว)',
    numberingFormatSlash: '1 / 10',
    numberingFormatCustom: 'กำหนดรูปแบบเอง',
    numberingCustomPlaceholder: 'เช่น หน้า {n}/{total} หรือ P.{n}',
    numberingPositionLabel: 'ตำแหน่งเลขหน้า',
    numberingPositionBottomCenter: 'กึ่งกลางด้านล่าง (มาตรฐาน)',
    numberingPositionBottomRight: 'มุมล่างขวา',
    numberingPositionBottomLeft: 'มุมล่างซ้าย',
    numberingPositionTopCenter: 'กึ่งกลางด้านบน',
    numberingPositionTopRight: 'มุมบนขวา',
    numberingPositionTopLeft: 'มุมบนซ้าย',
    numberingSkipCoverLabel: 'ข้ามหน้าแรก (หน้าปกไม่ต้องรันเลข)',
    numberingSizeLabel: 'ขนาดตัวอักษร',
    numberingSizeSmall: 'เล็ก (9pt)',
    numberingSizeRegular: 'ปกติ (11pt)',
    numberingSizeLarge: 'ใหญ่ (14pt)',
    numberingMarginLabel: 'ระยะห่างจากขอบกระดาษ',
    numberingMarginCompact: 'ชิดขอบ (18pt)',
    numberingMarginStandard: 'มาตรฐาน (28pt)',
    numberingMarginWide: 'กว้าง (42pt)',
    numberingBtn: 'รันเลขหน้าและดาวน์โหลด',
    toastNumberingSuccess: 'รันเลขหน้าและดาวน์โหลด PDF สำเร็จแล้ว!',

    // Metadata modal
    metadataModalTitle: 'ข้อมูลและสิทธิ์เอกสาร PDF',
    metadataModalDesc: 'ตรวจสอบ ลบ หรือแก้ไขข้อมูลส่วนบุคคลของเอกสารเพื่อความปลอดภัยก่อนส่งต่อ',
    metadataQuickSanitizeBtn: 'ล้างข้อมูลส่วนบุคคลทั้งหมด (1-Click Clean)',
    metadataTitleLabel: 'ชื่อเรื่อง (Title)',
    metadataAuthorLabel: 'ผู้สร้าง/ผู้เขียน (Author)',
    metadataSubjectLabel: 'หัวข้อ (Subject)',
    metadataKeywordsLabel: 'คำสำคัญ (Keywords คั่นด้วยจุลภาค)',
    metadataCreatorLabel: 'แอปพลิเคชันที่ใช้สร้าง (Creator)',
    metadataProducerLabel: 'ตัวแปลง PDF (Producer)',
    metadataCleanHint: 'การล้างข้อมูลจะลบชื่อผู้เขียน ชื่อโปรแกรม และร่องรอยอุปกรณ์ทิ้ง 100%',
    metadataSaveBtn: 'บันทึกข้อมูลและดาวน์โหลด',
    toastMetadataSanitized: 'ล้างข้อมูลส่วนบุคคลใน PDF เรียบร้อยแล้ว!',
    toastMetadataSaved: 'อัปเดตข้อมูลเอกสารและดาวน์โหลดสำเร็จแล้ว!',

    // PDF to Images modal
    pdf2imgModalTitle: 'แปลงหน้า PDF เป็นรูปภาพ',
    pdf2imgModalDesc: 'เรนเดอร์และสกัดแต่ละหน้าเป็นภาพ PNG หรือ JPG ความละเอียดสูง',
    pdf2imgFormatLabel: 'ฟอร์แมตรูปภาพ',
    pdf2imgDpiLabel: 'ความละเอียด (DPI)',
    pdf2imgBtn: 'สกัดและดาวน์โหลด ZIP',

    // Images to PDF modal
    img2pdfModalTitle: 'แปลงรูปภาพเป็น PDF',
    img2pdfModalDesc: 'รวมไฟล์รูปภาพ JPG, PNG, WebP เข้าเป็นเอกสาร PDF ฉบับเดียว',
    img2pdfSizingLabel: 'ขนาดหน้ากระดาษ',
    img2pdfFitA4: 'พอดีกระดาษ A4 มาตรฐาน (กึ่งกลาง)',
    img2pdfFitOriginal: 'คงขนาดตามสัดส่วนภาพเดิม',
    img2pdfSelectBtn: 'เลือกรูปภาพ',
    img2pdfConvertBtn: 'แปลงและเพิ่มลงใน Visual Studio',

    // Extract text modal
    extractTextModalTitle: 'ดึงข้อความจาก PDF',
    extractTextCopyBtn: 'คัดลอกข้อความ',
    extractTextCopiedBtn: 'คัดลอกแล้ว!',
    extractTextDownloadBtn: 'ดาวน์โหลด .txt',
    extractTextEmpty: '[ไม่พบข้อความที่เลือกได้ในเอกสารนี้]',

    // Password modal
    passwordModalTitle: 'PDF มีรหัสผ่านป้องกัน',
    passwordModalDesc: 'กรุณากรอกรหัสผ่านเพื่อเปิด {name}:',
    passwordPlaceholder: 'รหัสผ่านเอกสาร',
    passwordUnlockBtn: 'ปลดล็อกและนำเข้า',

    // Lightbox modal
    lightboxTitle: 'ดูตัวอย่างหน้าเอกสารความละเอียดสูง',
    lightboxFineTextHint: 'เรนเดอร์เวกเตอร์ความคมชัดสูงสำหรับอ่านตัวอักษรขนาดเล็ก สัญญา และแบบแปลนสถาปัตยกรรม/วิศวกรรม',
    lightboxZoomIn: 'ขยาย (+)',
    lightboxZoomOut: 'ย่อ (-)',
    lightboxResetZoom: 'รีเซ็ตขนาด (100%)',
    lightboxFitPage: 'พอดีหน้าจอ',
    lightboxPrevPage: 'หน้าก่อนหน้า (←)',
    lightboxNextPage: 'หน้าถัดไป (→)',
    lightboxRotate: 'หมุน 90° (R)',
    lightboxClose: 'ปิด (Esc)',
    lightboxPageCounter: 'หน้า {current} จากทั้งหมด {total}',

    // Toasts & Alerts
    toastSessionRestored: 'กู้คืนพื้นที่ทำงานจากเซสชันก่อนหน้าแล้ว',
    toastWorkspaceCleared: 'ล้างพื้นที่ทำงานแล้ว',
    toastImportSuccess: 'นำเข้า {count} หน้าสำเร็จ!',
    toastExportSuccess: 'ส่งออก {count} หน้าสำเร็จ!',
    toastSelectDocFirst: 'กรุณาเลือกเอกสาร PDF ก่อน',
    toastUploadPdfOrImg: 'กรุณาเลือกไฟล์ PDF หรือรูปภาพ',
    toastMinPagesToSplit: 'ต้องมีอย่างน้อย 2 หน้าจึงจะแยกไฟล์ได้',
    toastNoPagesToExport: 'ไม่มีหน้าเอกสารที่จะส่งออก',
    toastPageRemoved: 'ลบหน้าแล้ว',
    toastPagesRemoved: 'ลบ {count} หน้าแล้ว',
    toastUndo: 'เลิกทำ',
    toastPagesRestored: 'กู้คืน {count} หน้าแล้ว!',
    toastRotatedAll: 'หมุนเอกสารทั้งหมด {count} หน้า (+{deg}°)',
    toastRotatedSelected: 'หมุนหน้าที่เลือก {count} หน้า (+{deg}°)',
    toastAppInstalled: 'ติดตั้ง mePDF เรียบร้อยแล้ว!',
    toastOfflineReady: 'mePDF พร้อมใช้งานแบบออฟไลน์ 100% แล้ว!',
    toastOfflineActive: 'เข้าสู่โหมดออฟไลน์ ทุกฟังก์ชันทำงานบนเครื่อง 100%!',
    toastOnlineActive: 'เชื่อมต่ออินเทอร์เน็ตแล้ว',
    toastLanguageSwitched: 'เปลี่ยนภาษาเป็นภาษาไทยแล้ว',

    // Auth & Account
    authModalTitleSignIn: 'เข้าสู่ระบบ mePDF',
    authModalTitleSignUp: 'สร้างบัญชี mePDF',
    authTabSignIn: 'เข้าสู่ระบบ',
    authTabSignUp: 'สมัครสมาชิก',
    authGoogleBtn: 'เข้าสู่ระบบด้วย Google',
    authOrDivider: 'หรือ',
    authMagicLinkDesc: 'เข้าสู่ระบบแบบไม่ต้องใช้รหัสผ่านผ่านลิงก์ทางอีเมล',
    authEmailPlaceholder: 'name@example.com',
    authSendMagicLinkBtn: 'ส่งลิงก์เข้าสู่ระบบ',
    authMagicLinkSent: 'ส่งลิงก์แล้ว! กรุณาตรวจสอบอีเมลของคุณ',
    authPasswordLabel: 'รหัสผ่าน',
    authPasswordPlaceholder: '••••••••',
    authFullNameLabel: 'ชื่อ-นามสกุล',
    authFullNamePlaceholder: 'เช่น สมชาย ใจดี',
    authSignInBtn: 'เข้าสู่ระบบ',
    authSignUpBtn: 'สร้างบัญชี',
    authSignOutBtn: 'ออกจากระบบ',
    authSignedOutToast: 'ออกจากระบบเรียบร้อยแล้ว',
    authSignedInToast: 'ยินดีต้อนรับกลับ, {name}!',
    authRegisteredToast: 'สร้างบัญชีเรียบร้อยแล้ว!',
    authErrorGeneric: 'การยืนยันตัวตนล้มเหลว กรุณาตรวจสอบข้อมูลอีกครั้ง',
    authSignInPrompt: 'เข้าสู่ระบบเพื่อใช้งานคลังเอกสารบนคลาวด์และบันทึกไฟล์ข้ามอุปกรณ์',
    authNeedAccount: 'ยังไม่มีบัญชี? สมัครสมาชิก',
    authAlreadyAccount: 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ',

    // Account Widget & Tiers
    accountBtnLabel: 'บัญชีผู้ใช้',
    accountSignInBtn: 'เข้าสู่ระบบ',
    accountTierFree: 'FREE',
    accountTierPro: 'PRO',
    accountStorageUsed: 'ใช้ไป {used} จาก {limit}',
    accountMyDocuments: 'คลังเอกสารบนคลาวด์',
    accountUpgradePro: 'อัปเกรดเป็น Pro (10 GB)',
    accountProActive: 'ใช้งานแพ็กเกจ Pro',
    accountProUnlimited: 'สมาชิก Pro',

    // Cloud Library
    cloudLibTitle: 'คลังเอกสารบนคลาวด์',
    cloudLibDesc: 'ซิงค์ จัดการ และเข้าถึง PDF ได้อย่างปลอดภัยจากทุกที่ พร้อมระบบหมดอายุอัตโนมัติ 30 วันหรือปักหมุดถาวร',
    cloudLibSearchPlaceholder: 'ค้นหาเอกสาร...',
    cloudLibEmpty: 'ยังไม่มีเอกสารในคลังคลาวด์ของคุณ',
    cloudLibEmptySub: 'แก้ไข PDF ใน Visual Studio แล้วกด "บันทึกลงคลาวด์" เพื่อซิงค์ไฟล์',
    cloudLibOpenStudio: 'เปิดใน Visual Studio',
    cloudLibDownload: 'ดาวน์โหลด',
    cloudLibShare: 'แชร์ลิงก์',
    cloudLibDelete: 'ลบ',
    cloudLibDeleteConfirm: 'คุณแน่ใจหรือไม่ว่าต้องการลบเอกสารนี้ออกจากคลาวด์? ไม่สามารถยกเลิกการกระทำนี้ได้',
    cloudLibPinned: 'ปักหมุดแล้ว (ถาวร)',
    cloudLibExpiresIn: 'หมดอายุในอีก {days} วัน',
    cloudLibExpiresToday: 'หมดอายุวันนี้',
    cloudLibPinBtn: 'ปักหมุดเอกสาร',
    cloudLibUnpinBtn: 'ยกเลิกการปักหมุด',
    cloudLibShareCopied: 'คัดลอกลิงก์สำหรับแชร์ไปยังคลิปบอร์ดแล้ว!',
    cloudLibDeleted: 'ลบเอกสารออกจากคลาวด์แล้ว',
    cloudLibLoadingDoc: 'กำลังเปิดเอกสารใน Visual Studio...',
    cloudLibDocCount: '{count} เอกสาร',

    // Save to Cloud Modal
    saveCloudTitle: 'บันทึกลงคลังคลาวด์',
    saveCloudDesc: 'บันทึก PDF จากพื้นที่ทำงานลงคลาวด์เพื่อเข้าถึงจากอุปกรณ์ใดก็ได้',
    saveCloudFilenameLabel: 'ชื่อไฟล์เอกสาร',
    saveCloudPages: '{count} หน้า',
    saveCloudPinOption: 'ปักหมุดเอกสาร (เก็บถาวร ไม่หมดอายุใน 30 วัน)',
    saveCloudQuotaLabel: 'โควตาพื้นที่จัดเก็บ',
    saveCloudQuotaRemaining: 'เหลืออีก {remaining} จากทั้งหมด {limit}',
    saveCloudExceeded: 'พื้นที่จัดเก็บไม่เพียงพอ กรุณาลบไฟล์เก่าหรืออัปเกรดเป็น Pro',
    saveCloudBtn: 'บันทึกลงคลาวด์',
    saveCloudSaving: 'กำลังบันทึกลงคลาวด์...',
    saveCloudSuccess: 'บันทึก "{name}" ลงคลังคลาวด์สำเร็จแล้ว!',
    saveCloudBtnToolbar: 'บันทึกลงคลาวด์',
  },
};

export type TranslationKey = keyof typeof translations.en;

const STORAGE_KEY = 'mepdf_lang';
let currentLang: Language = 'th'; // Default to Thai for local users, or detected

// Initialize language preference
function getInitialLanguage(): Language {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'th' || stored === 'en') return stored;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      if (navigator.language.toLowerCase().startsWith('th')) return 'th';
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return 'en';
}

currentLang = getInitialLanguage();

const listeners = new Set<(lang: Language) => void>();

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  } catch {
    // Safe fallback
  }

  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch (e) {
      console.error('Error in i18n listener:', e);
    }
  });
}

export function onLanguageChange(listener: (lang: Language) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = translations[currentLang] || translations.en;
  let text = dict[key] || translations.en[key] || key;

  if (params) {
    for (const [paramKey, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
    }
  }

  return text;
}
