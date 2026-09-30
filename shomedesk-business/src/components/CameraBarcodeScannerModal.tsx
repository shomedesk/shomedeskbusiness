import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, 
  X, 
  Flashlight, 
  RefreshCw, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  HelpCircle 
} from 'lucide-react';
import { toast } from 'sonner';

interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export function CameraBarcodeScannerModal({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Product Barcode',
}: CameraBarcodeScannerModalProps) {
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play audio beep upon successful scan
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880 Hz
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio not permitted or supported
    }

    // Haptic vibration feedback on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([70, 30, 70]);
    }
  };

  // Supported standard retail barcodes & QR
  const formatsToSupport = [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,
  ];

  // Initialize and enumerate cameras
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setErrorMsg(null);
    setLastScannedCode(null);

    const initScanner = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back/environment camera
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        } else {
          // If direct device list is empty, will use facingMode: "environment"
          setSelectedCameraId('environment');
        }
      } catch (err: any) {
        console.warn('Could not enumerate cameras:', err);
        // Fallback to generic environment camera
        setSelectedCameraId('environment');
      }
    };

    initScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  // Start scanning whenever selected camera changes or scanner mounts
  useEffect(() => {
    if (!isOpen || !selectedCameraId) return;

    let isMounted = true;

    const startScanner = async () => {
      stopScanner();

      try {
        const html5QrCode = new Html5Qrcode('camera-reader-viewport', {
          formatsToSupport,
          verbose: false,
        });
        html5QrCodeRef.current = html5QrCode;

        const cameraConfig = selectedCameraId === 'environment' 
          ? { facingMode: 'environment' } 
          : { deviceId: { exact: selectedCameraId } };

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 180 },
          aspectRatio: 1.333333,
        };

        await html5QrCode.start(
          cameraConfig,
          config,
          (decodedText) => {
            if (!isMounted) return;
            handleSuccessfulScan(decodedText);
          },
          (errorMessage) => {
            // Frame scan failure is expected when no barcode is in frame, ignore
          }
        );

        if (isMounted) {
          setIsScanning(true);
          setErrorMsg(null);

          // Check if torch/flashlight is supported
          try {
            const capabilities = (html5QrCode as any).getRunningTrackCapabilities?.();
            if (capabilities && 'torch' in capabilities) {
              setHasTorch(true);
            }
          } catch {
            setHasTorch(false);
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to start camera scanner:', err);
        setIsScanning(false);
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMsg('Camera permission was denied. Please allow camera permissions in your browser or take a photo below.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMsg('No camera hardware found on this device. You can capture or upload a barcode image below.');
        } else {
          setErrorMsg('Camera stream not accessible. You can take a photo of the barcode or use an external scanner.');
        }
      }
    };

    // Give DOM a frame to mount the container div
    const timer = setTimeout(startScanner, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, selectedCameraId]);

  const stopScanner = () => {
    if (html5QrCodeRef.current) {
      if (html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {}).finally(() => {
          try {
            html5QrCodeRef.current?.clear();
          } catch {}
          html5QrCodeRef.current = null;
        });
      } else {
        try {
          html5QrCodeRef.current.clear();
        } catch {}
        html5QrCodeRef.current = null;
      }
    }
    setIsScanning(false);
    setTorchOn(false);
  };

  const handleSuccessfulScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    playBeep();
    setLastScannedCode(trimmed);
    onScan(trimmed);
    toast.success(`Scanned Barcode: ${trimmed}`);
  };

  // Toggle flashlight / torch
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const nextState = !torchOn;
      await (html5QrCodeRef.current as any).applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  // Switch between available cameras
  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  // Image file scan fallback (works 100% on all mobile devices via camera capture)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading('Decoding barcode image...');
    try {
      const scanner = new Html5Qrcode('camera-reader-viewport-file-temp', {
        formatsToSupport,
        verbose: false,
      });

      const decodedResult = await scanner.scanFile(file, true);
      scanner.clear();

      toast.dismiss(toastId);
      handleSuccessfulScan(decodedResult);
    } catch (err: any) {
      toast.error('Could not detect a clear barcode in the image. Please try again with good lighting.', { id: toastId });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col relative my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5 text-blue-400">
            <div className="p-2 bg-blue-500/10 rounded-xl">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                {title}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Hold product barcode inside the scanner frame
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Camera Viewport Container */}
        <div className="relative bg-black flex flex-col items-center justify-center min-h-[300px] overflow-hidden">
          {/* html5-qrcode video is injected here */}
          <div 
            id="camera-reader-viewport" 
            className="w-full aspect-[4/3] max-h-[360px] overflow-hidden flex items-center justify-center"
          />
          {/* Hidden helper for file scanning */}
          <div id="camera-reader-viewport-file-temp" className="hidden" />

          {/* Scanner Guide Overlay with Animated Laser Beam */}
          {isScanning && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              <div className="relative w-64 h-44 rounded-2xl border-2 border-dashed border-blue-400/80 shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center justify-center overflow-hidden">
                {/* Corner targets */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                
                {/* Animated Horizontal Scan Laser */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse animate-bounce" />
              </div>
              <p className="mt-3 text-[11px] font-bold text-white bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm shadow">
                Align barcode within target box
              </p>
            </div>
          )}

          {/* Camera Permission / Access Error State */}
          {errorMsg && (
            <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                <AlertCircle size={28} />
              </div>
              <h4 className="text-sm font-black text-white">Camera Access Required</h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                {errorMsg}
              </p>
              
              <div className="flex flex-col gap-2 w-full max-w-xs pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-lg shadow-blue-900/30"
                >
                  <Upload size={15} />
                  <span>Take / Upload Barcode Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* Flash Scanned Result Banner */}
          {lastScannedCode && (
            <div className="absolute top-3 left-3 right-3 bg-emerald-500/90 text-white p-2.5 rounded-xl shadow-lg flex items-center justify-between text-xs font-bold backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle2 size={16} className="text-white shrink-0" />
                <span className="truncate">Scanned: {lastScannedCode}</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded uppercase">Success</span>
            </div>
          )}
        </div>

        {/* Scanner Controls Toolbar */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            {/* Flashlight toggle */}
            {hasTorch ? (
              <button
                type="button"
                onClick={toggleTorch}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  torchOn 
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' 
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Flashlight size={14} />
                <span>{torchOn ? 'Torch On' : 'Torch'}</span>
              </button>
            ) : <div />}

            {/* Switch Camera Button (if multiple cameras available) */}
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800 transition-all cursor-pointer"
                title="Switch Camera (Front/Back)"
              >
                <RefreshCw size={14} />
                <span>Switch Cam</span>
              </button>
            )}

            {/* Photo / Image File Upload (100% Reliable Mobile Fallback) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all cursor-pointer ml-auto"
              title="Upload photo from camera album"
            >
              <Upload size={14} />
              <span>Capture Photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-800/60">
            <span>Supports EAN-13, Code 128, UPC, QR</span>
            <button
              type="button"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="text-slate-400 hover:text-white font-bold underline cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
