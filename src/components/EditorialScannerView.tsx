import React, { useState, useRef, useEffect } from 'react';
import { Book } from '../types';
import { api } from '../api';

export type ScannerMode = 'camera' | 'upload' | 'demo' | 'manual';
export type ScannerState = 
  | 'idle' 
  | 'camera-starting' 
  | 'camera-ready' 
  | 'captured' 
  | 'processing' 
  | 'isbn-detected' 
  | 'ocr-processing' 
  | 'searching' 
  | 'matched' 
  | 'multiple-matches' 
  | 'no-match' 
  | 'error';

interface MatchCandidate {
  book: Book;
  confidence: number;
  matchType: string;
  evidence: string;
}

interface EditorialScannerViewProps {
  books: Book[];
  onAddToCart: (book: Book, quantity?: number) => void;
  onQuickView: (book: Book) => void;
  onToggleWishlist?: (bookId: number, title?: string) => void;
}

export const EditorialScannerView: React.FC<EditorialScannerViewProps> = ({
  books,
  onAddToCart,
  onQuickView,
  onToggleWishlist,
}) => {
  // Scanner state machine
  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('camera');

  // Camera & Image preview states
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string>('image/jpeg');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Result state
  const [matchedBook, setMatchedBook] = useState<Book | null>(null);
  const [matchType, setMatchType] = useState<string | null>(null);
  const [calculatedConfidence, setCalculatedConfidence] = useState<number | null>(null);
  const [matchEvidence, setMatchEvidence] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [detectedMetadata, setDetectedMetadata] = useState<any | null>(null);

  // Manual search query state
  const [manualQuery, setManualQuery] = useState('');

  const fallbackSamples: Book[] = [
    {
      id: 1,
      title: 'Clean Code',
      author: 'Robert C. Martin',
      isbn: '9780132350884',
      price: 899,
      discount: 15,
      stock: 12,
      rating: 4.8,
      pages: 464,
      year: 2008,
      language: 'English',
      publisher: 'Prentice Hall',
      category: 'Engineering',
      categorySlug: 'engineering',
      coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777f?auto=format&fit=crop&q=80&w=600',
      description: 'Even bad code can function. But if code isn\'t clean, it can bring a development organization to its knees.'
    },
    {
      id: 2,
      title: 'Atomic Habits',
      author: 'James Clear',
      isbn: '9780735211292',
      price: 650,
      discount: 20,
      stock: 8,
      rating: 4.9,
      pages: 320,
      year: 2018,
      language: 'English',
      publisher: 'Avery',
      category: 'Self-Help',
      categorySlug: 'self-help',
      coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600',
      description: 'An easy & proven way to build good habits & break bad ones.'
    },
    {
      id: 3,
      title: 'The Pragmatic Programmer',
      author: 'David Thomas, Andrew Hunt',
      isbn: '9780201616224',
      price: 920,
      discount: 10,
      stock: 5,
      rating: 4.8,
      pages: 352,
      year: 1999,
      language: 'English',
      publisher: 'Addison-Wesley',
      category: 'Engineering',
      categorySlug: 'engineering',
      coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
      description: 'Your journey to mastery in software craftsmanship.'
    }
  ];

  const displaySamples = (books && books.length > 0) ? books.slice(0, 4) : fallbackSamples;

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const barcodeScanIntervalRef = useRef<any>(null);

  // Clean up media stream and timers on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const stopCameraStream = () => {
    if (barcodeScanIntervalRef.current) {
      clearInterval(barcodeScanIntervalRef.current);
      barcodeScanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // 1. CAMERA LIFECYCLE
  const startCamera = async () => {
    stopCameraStream();
    setCameraError(null);
    setGeneralError(null);
    setPreviewImage(null);
    setScannerMode('camera');
    setScannerState('camera-starting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your current browser. Please upload an image instead.');
      setScannerState('error');
      return;
    }

    try {
      // Request camera permission only after explicit user interaction
      // Prefer rear/environment camera on mobile
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScannerState('camera-ready');

        // Optional: Real-time Barcode Detection if supported
        initRealtimeBarcodeDetection();
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was denied. Please allow camera access in your browser settings, or use image upload below.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera hardware found on this device. Please upload a book cover photo instead.');
      } else {
        setCameraError(err.message || 'Unable to start camera preview. Please upload an image instead.');
      }
      setScannerState('error');
      stopCameraStream();
    }
  };

  const stopCamera = () => {
    stopCameraStream();
    setScannerState('idle');
  };

  // Real-time Barcode Detector loop (Web standard BarcodeDetector API)
  const initRealtimeBarcodeDetection = () => {
    if (!('BarcodeDetector' in window)) return;

    try {
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
      });

      barcodeScanIntervalRef.current = setInterval(async () => {
        if (
          videoRef.current && 
          videoRef.current.readyState === 4 && 
          scannerState === 'camera-ready'
        ) {
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              const detectedCode = barcodes[0].rawValue;
              stopCameraStream();
              processDetectedBarcode(detectedCode, 'REAL CAMERA');
            }
          } catch {
            // Frame skip is normal during movement
          }
        }
      }, 750);
    } catch {
      // BarcodeDetector not supported or disabled
    }
  };

  // Freeze/Capture Camera Frame
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    stopCameraStream();
    setPreviewImage(dataUrl);
    setPreviewMimeType('image/jpeg');
    setScannerMode('camera');
    setScannerState('captured');
  };

  // Retake photo / Resume camera
  const handleRetake = () => {
    setPreviewImage(null);
    setMatchedBook(null);
    setCandidates([]);
    setGeneralError(null);
    startCamera();
  };

  // 2. IMAGE UPLOAD LIFECYCLE
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCameraStream();
    setGeneralError(null);
    setCameraError(null);
    setMatchedBook(null);
    setCandidates([]);

    // Validate file type
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type.toLowerCase())) {
      setGeneralError('Invalid image format. Please upload a JPG, JPEG, PNG, or WEBP file.');
      setScannerState('error');
      return;
    }

    // Validate file size (max 10MB)
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setGeneralError('Image size exceeds 10MB limit. Please upload a compressed or standard photo.');
      setScannerState('error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewImage(dataUrl);
      setPreviewMimeType(file.type || 'image/jpeg');
      setScannerMode('upload');
      setScannerState('captured');
    };

    reader.onerror = () => {
      setGeneralError('Failed to read image file from disk.');
      setScannerState('error');
    };

    reader.readAsDataURL(file);
  };

  // 3. EXECUTE RECOGNITION PIPELINE ON PREVIEW IMAGE
  const processImageRecognition = async () => {
    if (!previewImage) return;

    setScannerState('processing');
    setGeneralError(null);
    setMatchedBook(null);
    setCandidates([]);

    // Step A: Attempt client-side BarcodeDetector on image if supported
    let detectedBarcode: string | null = null;
    if ('BarcodeDetector' in window) {
      try {
        const img = new Image();
        img.src = previewImage;
        await img.decode();
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'qr_code'],
        });
        const barcodes = await barcodeDetector.detect(img);
        if (barcodes.length > 0 && barcodes[0].rawValue) {
          detectedBarcode = barcodes[0].rawValue;
        }
      } catch {
        // Fallback to OCR pipeline
      }
    }

    if (detectedBarcode) {
      await processDetectedBarcode(detectedBarcode, scannerMode === 'camera' ? 'REAL CAMERA' : 'REAL IMAGE UPLOAD');
      return;
    }

    // Step B: Send to Backend OCR & Deterministic Matching Pipeline
    setScannerState('ocr-processing');
    try {
      const res = await api.scanVision(previewImage, previewMimeType);

      setDetectedMetadata(res.detectedMetadata || null);

      if (res.matched && res.book) {
        setMatchedBook(res.book);
        setMatchType(res.matchType);
        setCalculatedConfidence(res.confidence);
        setMatchEvidence(res.evidence);
        setCandidates(res.candidates || []);
        setScannerState('matched');
      } else if (res.candidates && res.candidates.length > 0) {
        setCandidates(res.candidates);
        setCalculatedConfidence(res.confidence);
        setMatchEvidence(res.evidence);
        setScannerState('multiple-matches');
      } else {
        setScannerState('no-match');
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Optical machine vision analysis could not recognize a textbook cover in this image.');
      setScannerState('no-match');
    }
  };

  // Process detected barcode string
  const processDetectedBarcode = async (rawCode: string, source: 'REAL CAMERA' | 'REAL IMAGE UPLOAD') => {
    setScannerState('isbn-detected');
    setGeneralError(null);

    const cleanIsbn = rawCode.replace(/[^0-9X]/gi, '');

    try {
      setScannerState('searching');
      const res = await api.scanIsbn(cleanIsbn);

      if (res.matched && res.book) {
        setMatchedBook(res.book);
        setMatchType(res.matchType || 'ISBN_EXACT');
        setCalculatedConfidence(res.confidence || 1.0);
        setMatchEvidence(`Detected via ${source} barcode scan: ${res.evidence}`);
        setCandidates(res.candidates || []);
        setScannerState('matched');
      } else {
        setScannerState('no-match');
      }
    } catch (err: any) {
      setGeneralError(err.message || `No book found in catalog for barcode: ${rawCode}`);
      setScannerState('no-match');
    }
  };

  // 4. MANUAL ISBN / TITLE SEARCH
  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;

    stopCameraStream();
    setScannerMode('manual');
    setScannerState('searching');
    setGeneralError(null);
    setMatchedBook(null);
    setCandidates([]);

    const clean = manualQuery.trim();
    const isDigits = /^[0-9X-]+$/i.test(clean);

    try {
      if (isDigits) {
        const res = await api.scanIsbn(clean);
        if (res.matched && res.book) {
          setMatchedBook(res.book);
          setMatchType(res.matchType);
          setCalculatedConfidence(res.confidence);
          setMatchEvidence(res.evidence);
          setCandidates(res.candidates || []);
          setScannerState('matched');
        } else {
          setScannerState('no-match');
        }
      } else {
        const res = await api.matchText(clean);
        if (res.matched && res.book) {
          setMatchedBook(res.book);
          setMatchType(res.matchType);
          setCalculatedConfidence(res.confidence);
          setMatchEvidence(res.evidence);
          setCandidates(res.candidates || []);
          setScannerState('matched');
        } else if (res.candidates && res.candidates.length > 0) {
          setCandidates(res.candidates);
          setCalculatedConfidence(res.confidence);
          setMatchEvidence(res.evidence);
          setScannerState('multiple-matches');
        } else {
          setScannerState('no-match');
        }
      }
    } catch (err: any) {
      setGeneralError(err.message || `No titles matching "${clean}" found.`);
      setScannerState('no-match');
    }
  };

  // 5. DEMO SAMPLE MODE (Explicitly labelled DEMO)
  const handleSelectDemoSample = (book: Book) => {
    stopCameraStream();
    setPreviewImage(book.coverImage);
    setScannerMode('demo');
    setMatchedBook(book);
    setMatchType('DEMO_SAMPLE');
    setCalculatedConfidence(1.0);
    setMatchEvidence(`Preloaded campus demonstration sample (${book.title}). This sample does not invoke hardware vision.`);
    setCandidates([]);
    setGeneralError(null);
    setScannerState('matched');
  };

  // Reset to initial ready state
  const handleResetScanner = () => {
    stopCameraStream();
    setScannerState('idle');
    setMatchedBook(null);
    setCandidates([]);
    setPreviewImage(null);
    setGeneralError(null);
    setCameraError(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans">
      
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Editorial Header */}
      <div className="max-w-3xl mx-auto text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold mb-3">
          <i className="fa-solid fa-barcode text-amber-700"></i>
          <span>DETERMINISTIC OPTICAL COVER &amp; ISBN SCANNER</span>
        </div>
        <h1 className="font-serif font-black text-3xl sm:text-4xl text-slate-950 tracking-tight">
          Point, Scan, and Learn Instantly
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-2 font-sans max-w-xl mx-auto leading-relaxed">
          Scan ISBN barcodes using real device camera video frames, upload textbook covers for optical OCR matching, or search the BookNest warehouse directly.
        </p>

        {/* Mode Indicators */}
        <div className="flex items-center justify-center gap-2 mt-4 text-[11px] font-mono">
          <span className="text-slate-400">Active Pipeline Mode:</span>
          <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
            scannerMode === 'camera' 
              ? 'bg-blue-100 text-blue-900 border border-blue-200' 
              : scannerMode === 'upload'
              ? 'bg-purple-100 text-purple-900 border border-purple-200'
              : scannerMode === 'demo'
              ? 'bg-amber-100 text-amber-900 border border-amber-300'
              : 'bg-slate-100 text-slate-800'
          }`}>
            {scannerMode === 'camera' && '● Real Camera Mode'}
            {scannerMode === 'upload' && '● Real Image Upload'}
            {scannerMode === 'demo' && '★ Try Scanner Demo'}
            {scannerMode === 'manual' && '⌨ Manual Search'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Viewfinder & Controls Frame */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xl">
          
          {/* Top HUD Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 text-xs">
            
            {/* Status indicator badge */}
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                scannerState === 'camera-ready' ? 'bg-emerald-500 animate-pulse' :
                scannerState === 'processing' || scannerState === 'ocr-processing' || scannerState === 'searching' ? 'bg-amber-500 animate-ping' :
                scannerState === 'matched' ? 'bg-emerald-600' :
                scannerState === 'error' || scannerState === 'no-match' ? 'bg-rose-500' :
                'bg-slate-400'
              }`}></span>
              <span className="font-mono text-[11px] text-slate-800 font-bold uppercase">
                {scannerState === 'idle' && 'Scanner Idle'}
                {scannerState === 'camera-starting' && 'Starting Camera...'}
                {scannerState === 'camera-ready' && 'Live Camera Active'}
                {scannerState === 'captured' && 'Frame Captured (Review)'}
                {scannerState === 'processing' && 'Analyzing Barcode...'}
                {scannerState === 'ocr-processing' && 'Running Vision OCR...'}
                {scannerState === 'searching' && 'Querying Catalog...'}
                {scannerState === 'matched' && 'Match Confirmed'}
                {scannerState === 'multiple-matches' && 'Possible Matches'}
                {scannerState === 'no-match' && 'No Match Found'}
                {scannerState === 'error' && 'Scanner Exception'}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {scannerState === 'camera-ready' ? (
                <>
                  <button
                    type="button"
                    onClick={captureFrame}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <i className="fa-solid fa-camera text-xs"></i>
                    <span>Capture Frame</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition-colors"
                  >
                    Stop
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <i className="fa-solid fa-video text-xs"></i>
                  <span>Start Camera</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-xs border border-amber-200 flex items-center gap-1.5 transition-colors"
              >
                <i className="fa-solid fa-cloud-arrow-up text-amber-700 text-xs"></i>
                <span>Upload Photo</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Camera Error Alert */}
          {cameraError && (
            <div className="mb-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3 animate-in fade-in duration-150">
              <i className="fa-solid fa-circle-exclamation text-rose-600 text-base mt-0.5 shrink-0"></i>
              <div className="flex-1">
                <div className="font-bold">Camera Initialization Issue</div>
                <div className="mt-0.5 leading-relaxed">{cameraError}</div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-rose-900 text-white font-semibold text-[11px]"
                  >
                    Upload Cover Photo Instead
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Viewfinder / Video Canvas Viewport */}
          <div className="relative aspect-[4/3] rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center border-2 border-slate-800 shadow-inner group">
            
            {/* Live Video Preview */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${scannerState === 'camera-ready' ? 'block' : 'hidden'}`}
            />

            {/* Captured / Uploaded Image Preview */}
            {previewImage && scannerState !== 'camera-ready' && (
              <img
                src={previewImage}
                alt="Captured Textbook"
                className="w-full h-full object-contain bg-slate-900"
              />
            )}

            {/* Offline Viewfinder State (When idle & no preview) */}
            {!previewImage && scannerState !== 'camera-ready' && scannerState !== 'camera-starting' && (
              <div className="text-center p-6 text-slate-400 max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3 text-2xl text-amber-400 shadow-inner">
                  <i className="fa-solid fa-camera-rotate"></i>
                </div>
                <h4 className="font-serif font-bold text-base text-slate-200">
                  Optical Viewfinder Ready
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Start your device camera to scan a physical barcode, or upload a cover photo to run machine vision.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-camera"></i>
                    <span>Start Live Camera</span>
                  </button>
                </div>
              </div>
            )}

            {/* Camera Starting Spinner */}
            {scannerState === 'camera-starting' && (
              <div className="text-center p-6 text-white">
                <i className="fa-solid fa-circle-notch fa-spin text-3xl text-amber-400 mb-2"></i>
                <p className="text-xs font-mono text-slate-300">Requesting camera device...</p>
              </div>
            )}

            {/* Laser reticle overlay (Visible during camera preview) */}
            {scannerState === 'camera-ready' && (
              <div className="absolute inset-8 border border-amber-500/40 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-amber-400"></div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-amber-400"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-amber-400"></div>
                  <div className="w-4 h-4 border-b-2 border-r-2 border-amber-400"></div>
                </div>
                <div className="absolute inset-x-8 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#fbbf24] animate-scan-line"></div>
              </div>
            )}

            {/* Processing HUD Overlay */}
            {(scannerState === 'processing' || scannerState === 'ocr-processing' || scannerState === 'searching') && (
              <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-white p-6">
                <i className="fa-solid fa-compact-disc fa-spin text-4xl text-amber-400 mb-3"></i>
                <div className="font-serif font-bold text-base">Running Optical Recognition</div>
                <p className="text-xs text-slate-300 font-mono mt-1 text-center max-w-xs">
                  {scannerState === 'ocr-processing' ? 'Extracting text and barcode vectors...' : 'Cross-referencing BookNest database...'}
                </p>
              </div>
            )}

          </div>

          {/* Captured Preview Action Bar ("Use This Image" vs "Retake") */}
          {scannerState === 'captured' && previewImage && (
            <div className="mt-4 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="text-xs text-amber-950 font-medium">
                <span className="font-bold">Image Ready:</span> Review your photo above before scanning.
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-rotate-left text-xs"></i>
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  onClick={processImageRecognition}
                  className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                  <span>Use This Image</span>
                </button>
              </div>
            </div>
          )}

          {/* Status HUD readout bar */}
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs font-mono flex items-center justify-between text-slate-700">
            <div className="flex items-center gap-2 truncate">
              <i className="fa-solid fa-terminal text-amber-600 text-xs shrink-0"></i>
              <span className="truncate">
                {scannerState === 'idle' && 'Ready. Start camera, upload photo, or enter ISBN.'}
                {scannerState === 'camera-starting' && 'Initializing MediaDevices video stream...'}
                {scannerState === 'camera-ready' && 'Align textbook cover or barcode in laser reticle.'}
                {scannerState === 'captured' && 'Frame held. Click "Use This Image" to begin match.'}
                {scannerState === 'processing' && 'Checking hardware barcode detector...'}
                {scannerState === 'ocr-processing' && 'Extracting title, author, and publisher...'}
                {scannerState === 'searching' && 'Ranking candidates against local database...'}
                {scannerState === 'matched' && (matchEvidence || 'Book successfully identified.')}
                {scannerState === 'multiple-matches' && 'Multiple possible matches found. Select one.'}
                {scannerState === 'no-match' && 'No catalog titles met similarity threshold.'}
                {scannerState === 'error' && (generalError || 'Scanner halted due to error.')}
              </span>
            </div>

            {calculatedConfidence !== null && scannerState === 'matched' && (
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                {Math.round(calculatedConfidence * 100)}% Calculated Match
              </span>
            )}
          </div>

          {/* General Error Banner */}
          {generalError && (
            <div className="mt-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation text-rose-600 shrink-0"></i>
              <span>{generalError}</span>
            </div>
          )}

          {/* Manual ISBN / Title Search Input */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <form onSubmit={handleManualSearch} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder="Or enter ISBN (e.g. 9780132350884) or title manually..."
                  className="w-full py-2.5 pl-8 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-400 text-xs"></i>
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs transition-colors shrink-0"
              >
                Lookup ISBN
              </button>
            </form>
          </div>

          {/* Try Scanner Demo Section (Explicitly Labelled DEMO) */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-flask text-amber-600"></i>
                <span>Try Scanner Demo (Preset Samples)</span>
              </span>
              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 text-[10px] font-bold font-mono">
                DEMO MODE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-2.5">
              Select a catalog sample to preview the recognized result card. Samples are explicitly labelled DEMO.
            </p>
            <div className="flex flex-wrap gap-2">
              {displaySamples.map(sample => (
                <button
                  key={sample.id}
                  type="button"
                  data-testid="demo-sample-btn"
                  onClick={() => handleSelectDemoSample(sample)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-slate-800 text-xs border border-slate-200 flex items-center gap-1.5 transition-colors"
                >
                  <span className="px-1 py-0.2 rounded bg-amber-200 text-amber-900 text-[9px] font-bold">DEMO</span>
                  <span className="font-medium truncate max-w-[140px]">{sample.title}</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Dynamic Results Frame */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* ================= RESULT: SINGLE CONFIDENT MATCH ================= */}
          {scannerState === 'matched' && matchedBook && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Header Badge */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    matchType === 'DEMO_SAMPLE'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    <i className={`fa-solid ${matchType === 'DEMO_SAMPLE' ? 'fa-flask' : 'fa-check'} text-[10px]`}></i>
                    <span>{matchType === 'DEMO_SAMPLE' ? 'DEMO SAMPLE' : 'BOOK FOUND'}</span>
                  </span>
                  {calculatedConfidence !== null && (
                    <span className="font-mono text-[10px] text-slate-500">
                      ({Math.round(calculatedConfidence * 100)}% Confidence)
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-slate-400">
                  ISBN: {matchedBook.isbn}
                </span>
              </div>

              {/* Evidence Callout */}
              {matchEvidence && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                  <i className="fa-solid fa-magnifying-glass text-amber-600 text-xs mt-0.5 shrink-0"></i>
                  <span className="leading-snug">{matchEvidence}</span>
                </div>
              )}

              {/* Book Details */}
              <div className="flex gap-4">
                <img
                  src={matchedBook.coverImage}
                  alt={matchedBook.title}
                  className="w-24 h-36 object-cover rounded-xl shadow-md book-spine shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest block">
                    {matchedBook.category}
                  </span>
                  <h3 className="font-serif font-bold text-lg text-slate-950 leading-snug line-clamp-2 mt-0.5">
                    {matchedBook.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">by {matchedBook.author}</p>
                  
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className="text-amber-500 font-bold flex items-center gap-1">
                      <i className="fa-solid fa-star text-[10px]"></i>
                      {matchedBook.rating}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{matchedBook.pages} pages</span>
                    {matchedBook.publisher && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500 truncate">{matchedBook.publisher}</span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif font-bold text-xl text-slate-900">
                      ₹{Math.round(matchedBook.price * (1 - matchedBook.discount / 100))}
                    </span>
                    {matchedBook.discount > 0 && (
                      <span className="text-xs text-slate-400 line-through">₹{matchedBook.price}</span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                {matchedBook.description}
              </p>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onAddToCart(matchedBook, 1)}
                    disabled={matchedBook.stock <= 0}
                    className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-amber-600 text-amber-50 hover:text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-bag-shopping"></i>
                    <span>Add to Bag (Stock: {matchedBook.stock})</span>
                  </button>
                  <button
                    onClick={() => onQuickView(matchedBook)}
                    className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                  >
                    Details
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {onToggleWishlist && (
                    <button
                      onClick={() => onToggleWishlist(matchedBook.id, matchedBook.title)}
                      className="flex-1 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-medium text-xs border border-amber-200 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <i className="fa-regular fa-heart text-amber-700"></i>
                      <span>Add to Wishlist</span>
                    </button>
                  )}
                  <button
                    onClick={handleResetScanner}
                    className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
                  >
                    Scan Another Book
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ================= RESULT: MULTIPLE POSSIBLE MATCHES ================= */}
          {scannerState === 'multiple-matches' && candidates.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
              
              <div className="pb-3 border-b border-slate-100">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">
                  <i className="fa-solid fa-list-check text-amber-700"></i>
                  POSSIBLE MATCHES ({candidates.length} Found)
                </span>
                <p className="text-xs text-slate-500 mt-1.5">
                  We found multiple catalog titles matching the extracted text. Please select the correct book:
                </p>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {candidates.map((cand, idx) => (
                  <div
                    key={cand.book.id || idx}
                    className="p-3.5 rounded-2xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={cand.book.coverImage}
                        alt={cand.book.title}
                        className="w-10 h-14 object-cover rounded shadow-xs shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-serif font-bold text-xs text-slate-900 line-clamp-1">
                          {cand.book.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">by {cand.book.author}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                            {Math.round(cand.confidence * 100)}% match
                          </span>
                          <span className="font-bold text-xs text-slate-900">
                            ₹{Math.round(cand.book.price * (1 - cand.book.discount / 100))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setMatchedBook(cand.book);
                        setMatchType(cand.matchType);
                        setCalculatedConfidence(cand.confidence);
                        setMatchEvidence(cand.evidence);
                        setScannerState('matched');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-amber-600 text-white font-bold text-xs shrink-0 transition-colors"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  onClick={handleResetScanner}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  None of these? Scan Again
                </button>
              </div>

            </div>
          )}

          {/* ================= RESULT: NO MATCH FOUND ================= */}
          {scannerState === 'no-match' && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-sm text-center animate-in fade-in duration-200">
              <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-4 text-2xl text-rose-500">
                <i className="fa-solid fa-magnifying-glass-chart"></i>
              </div>
              <h3 className="font-serif font-bold text-lg text-slate-900">
                No Exact Match Found
              </h3>
              <p className="text-xs text-slate-600 mt-2 max-w-sm mx-auto leading-relaxed">
                We couldn't confidently identify this textbook in the BookNest campus warehouse catalog. We never invent or fake a match.
              </p>

              {/* Honest Metadata Feedback */}
              {detectedMetadata && detectedMetadata.hasOcrData && (
                <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-left text-[11px] font-mono text-slate-600 space-y-1">
                  <div className="font-bold text-slate-800 uppercase text-[10px]">What the scanner saw:</div>
                  {detectedMetadata.title && <div>Title: <span className="text-slate-900">{detectedMetadata.title}</span></div>}
                  {detectedMetadata.author && <div>Author: <span className="text-slate-900">{detectedMetadata.author}</span></div>}
                  {detectedMetadata.isbn && <div>ISBN: <span className="text-slate-900">{detectedMetadata.isbn}</span></div>}
                </div>
              )}

              {/* Fallback actions */}
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={handleRetake}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm transition-all"
                >
                  Try Again with Better Lighting
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                >
                  Upload Another Image
                </button>
              </div>
            </div>
          )}

          {/* ================= DEFAULT IDLE STATE ================= */}
          {(scannerState === 'idle' || scannerState === 'camera-starting' || scannerState === 'camera-ready' || scannerState === 'captured' || scannerState === 'error') && !matchedBook && (
            <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-sm text-center text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-2xl text-slate-400">
                <i className="fa-solid fa-book-open-reader"></i>
              </div>
              <h3 className="font-serif font-bold text-lg text-slate-800">
                No Book Scanned Yet
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                Scan an ISBN barcode with your camera, upload a textbook cover photo, or enter an ISBN to view instant campus pricing and inventory.
              </p>
              
              <div className="mt-6 p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-left text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-check text-emerald-600"></i>
                  <span>Zero Fake Recognition Guarantee</span>
                </div>
                <div className="text-[11px] text-amber-800 leading-normal">
                  All scanner matches are computed via checksummed ISBNs, barcode detectors, or genuine string similarity algorithms.
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
