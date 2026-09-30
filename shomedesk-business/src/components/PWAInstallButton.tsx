import React, { useState } from 'react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';
import { Download, Smartphone, X, Check, Apple } from 'lucide-react';

export const PWAInstallButton: React.FC<{ className?: string; variant?: 'button' | 'badge' }> = ({ 
  className = '',
  variant = 'button'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 md:gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-2.5 md:px-3.5 py-1.5 md:py-2 text-xs font-bold text-white shadow-md shadow-blue-900/30 transition-all cursor-pointer active:scale-95 ${className}`}
        title="Install ShomeDesk App"
      >
        <Download size={14} className="animate-bounce" />
        <span className="hidden xs:inline">Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition-all cursor-pointer active:scale-95 ${className}`}
          title="Install on iOS Home Screen"
        >
          <Apple size={14} className="text-slate-300" />
          <span className="hidden xs:inline">Install PWA</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Smartphone size={20} />
                  <span>Install on iPhone / iPad</span>
                </div>
                <button 
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                  <p>In Safari, tap the <strong className="text-white">Share</strong> button (box with upward arrow) at bottom of screen.</p>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                  <p>Scroll down and select <strong className="text-white">Add to Home Screen</strong>.</p>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                  <p>Tap <strong className="text-white">Add</strong> in top-right. Launch directly like a native app!</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-bold text-white transition-all"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for desktop/android when prompt not yet fired: provide manual install trigger or install guide button
  return (
    <button
      onClick={() => {
        // If supported browser, try install or show info
        if (install) install();
      }}
      className={`hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer ${className}`}
      title="Install ShomeDesk App"
    >
      <Download size={13} className="text-blue-400" />
      <span>Install App</span>
    </button>
  );
};
