import React, { useState, useRef, useEffect } from 'react';
import { SalesPlayProduct } from '@/src/types';
import {
  Search,
  Barcode as BarcodeIcon,
  Plus,
  Package,
  CheckCircle2,
  AlertCircle,
  Camera
} from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '@/src/lib/currencyUtils';
import { CameraBarcodeScannerModal } from './CameraBarcodeScannerModal';

interface ProductSearchAndScanProps {
  products: SalesPlayProduct[];
  onSelectProduct: (product: SalesPlayProduct) => void;
  onAddCustomWithBarcode?: (barcode: string) => void;
  currency: string;
  autoFocusScanner?: boolean;
}

export function ProductSearchAndScan({
  products,
  onSelectProduct,
  onAddCustomWithBarcode,
  currency,
  autoFocusScanner = true,
}: ProductSearchAndScanProps) {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto focus scanner input when mounted
  useEffect(() => {
    if (autoFocusScanner && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [autoFocusScanner]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered products for search autocomplete
  const searchResults = React.useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase().trim();
    return products
      .filter(p =>
        p.product_name.toLowerCase().includes(term) ||
        p.product_code.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.category && p.category.toLowerCase().includes(term))
      )
      .slice(0, 10);
  }, [products, searchTerm]);

  // Handle Barcode Scan / Enter
  const handleBarcodeSubmit = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const scanned = barcodeInput.trim();
    if (!scanned) return;

    processBarcodeScan(scanned);
    setBarcodeInput('');
    // Keep focus on scanner input for rapid scanning
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const processBarcodeScan = (scannedCode: string) => {
    const code = scannedCode.trim().toLowerCase();
    // 1. Check exact match by barcode or product code
    const matched = products.find(
      p =>
        (p.barcode && p.barcode.toLowerCase() === code) ||
        p.product_code.toLowerCase() === code
    );

    if (matched) {
      onSelectProduct(matched);
      toast.success(`Scanned: "${matched.product_name}" (+1 Qty)`, {
        icon: <CheckCircle2 className="text-emerald-400" size={16} />,
      });
    } else {
      // If not in catalog, add custom item or notify
      if (onAddCustomWithBarcode) {
        onAddCustomWithBarcode(scannedCode.trim());
        toast.info(`New barcode "${scannedCode.trim()}" added to list. Enter item details.`);
      } else {
        toast.error(`Barcode "${scannedCode}" not found in SalesPlay inventory`);
      }
    }
  };

  const handleSelectFromSearch = (product: SalesPlayProduct) => {
    onSelectProduct(product);
    setSearchTerm('');
    setIsDropdownOpen(false);
    toast.success(`Added "${product.product_name}" to order`);
  };

  return (
    <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* 1. Barcode Gun / Reader Input Box (Pure div, never triggers form submit or page reload) */}
        <div className="flex-1 flex items-center gap-2 bg-slate-900 border-2 border-indigo-500/50 hover:border-indigo-500 focus-within:border-indigo-400 rounded-xl px-3 py-2.5 transition-all shadow-inner">
          <BarcodeIcon size={18} className="text-indigo-400 shrink-0" />
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="Scan barcode with scanner gun (or type barcode & press Enter)..."
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleBarcodeSubmit(e);
              }
            }}
            className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 outline-none font-mono"
          />
          {barcodeInput && (
            <button
              type="button"
              onClick={handleBarcodeSubmit}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3 py-1 rounded-lg shrink-0 cursor-pointer"
            >
              Add
            </button>
          )}
        </div>

        {/* 2. Mobile Camera Barcode Scanner Button */}
        <button
          type="button"
          onClick={() => setIsCameraOpen(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black px-3.5 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-blue-900/30 shrink-0 cursor-pointer active:scale-95 border border-blue-400/30"
          title="Scan Barcode with Mobile Phone Camera"
        >
          <Camera size={16} />
          <span className="hidden sm:inline">Camera</span> Scan
        </button>
      </div>

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScan={(scanned) => {
          processBarcodeScan(scanned);
        }}
        title="Mobile Barcode Scanner"
      />

      {/* 3. Product Search with Autocomplete Dropdown */}
      <div ref={searchContainerRef} className="relative">
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3.5 text-slate-500" />
          <input
            type="text"
            placeholder={`Search across ${products.length} products by name, category, or code...`}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsDropdownOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % Math.max(1, searchResults.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + searchResults.length) % Math.max(1, searchResults.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (searchResults[highlightedIndex]) {
                  handleSelectFromSearch(searchResults[highlightedIndex]);
                }
              }
            }}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 outline-none transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setIsDropdownOpen(false);
              }}
              className="absolute right-3 text-slate-500 hover:text-slate-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Autocomplete Results Dropdown */}
        {isDropdownOpen && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-800/80">
            {searchResults.map((product, idx) => (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelectFromSearch(product)}
                className={`w-full text-left p-3 flex items-center justify-between gap-3 transition-all cursor-pointer ${
                  idx === highlightedIndex ? 'bg-indigo-950/60 text-white' : 'hover:bg-slate-800/60 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 overflow-hidden shrink-0">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={16} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-100">{product.product_name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <span>Code: {product.product_code}</span>
                      {product.barcode && (
                        <>
                          <span>•</span>
                          <span>Barcode: {product.barcode}</span>
                        </>
                      )}
                      {product.category && (
                        <>
                          <span>•</span>
                          <span className="text-slate-500 font-sans">{product.category}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs font-black font-mono text-indigo-400">
                    Cost: {currency} {formatAmount(product.cost || product.price || 0, currency)}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-bold">
                    Stock: {product.in_stock ?? 0} {product.measurement || 'units'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {isDropdownOpen && searchTerm.trim() && searchResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 z-40 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-4 text-center text-xs text-slate-400">
            No products matching "{searchTerm}".
          </div>
        )}
      </div>

    </div>
  );
}
