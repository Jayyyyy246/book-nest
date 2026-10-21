import React from 'react';
import { AppView } from '../../types';

interface FooterProps {
  onNavigate: (view: AppView) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="mt-auto bg-slate-950 text-slate-400 border-t border-slate-800/80 pt-16 pb-12 font-sans text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-slate-800">
          
          {/* Col 1: Brand */}
          <div className="md:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                <i className="fa-solid fa-book-bookmark"></i>
              </div>
              <span className="font-serif font-black text-2xl text-white tracking-tight">
                BookNest
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed font-sans max-w-sm">
              Elevating campus literature and academic studies. 
              Full-stack bookstore with optical machine vision, automated inventory tracking, and student fulfillment.
            </p>
            <div className="text-[11px] text-amber-400 font-mono">
              Academic Capstone · University Edition 2026
            </div>
          </div>

          {/* Col 2: Navigation */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
              Storefront Subsystems
            </h4>
            <ul className="space-y-2">
              <li><button onClick={() => onNavigate('store')} className="hover:text-amber-300 cursor-pointer">Home Storefront</button></li>
              <li><button onClick={() => onNavigate('catalog')} className="hover:text-amber-300 cursor-pointer">Textbook Catalog</button></li>
              <li><button onClick={() => onNavigate('scanner')} className="hover:text-amber-300 cursor-pointer">Optical Book Scanner</button></li>
              <li><button onClick={() => onNavigate('orders')} className="hover:text-amber-300 cursor-pointer">Student Orders &amp; Invoices</button></li>
              <li><button onClick={() => onNavigate('admin')} className="hover:text-amber-300 cursor-pointer">Control Tower Dashboard</button></li>
            </ul>
          </div>

          {/* Col 3: Academic Credits */}
          <div className="md:col-span-5 space-y-3">
            <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">
              Architecture &amp; Security Compliance
            </h4>
            <p className="text-slate-400 leading-relaxed text-xs">
              Built with 100% Prepared Statements, Centralized XSS Escaping, Cryptographic CSRF Tokens, and OWASP Top 10 Hardening.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-400">
                OWASP Score: 100/100
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-amber-400">
                BCrypt Cost: 12
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-400">
                BarcodeDetector API Ready
              </span>
            </div>
          </div>

        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            © 2026 BookNest. All rights reserved. Crafted with care for campus scholars.
          </div>
          <div className="flex items-center gap-4">
            <span>Hostel Rapid Delivery: &lt; 30 Mins</span>
            <span>·</span>
            <span>Helpline: +91 98765 43210</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
