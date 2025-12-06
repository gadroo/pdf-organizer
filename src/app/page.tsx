'use client';

import { FileUp, Sparkles, GripVertical, Download } from 'lucide-react';
import { DropZone } from '@/components/upload/DropZone';

/**
 * Upload Page (Home)
 *
 * Landing page with drag-drop zone for PDF upload.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <FileUp className="h-4 w-4 text-slate-900" />
            </div>
            <span className="text-lg font-semibold text-white">
              PDF Organizer
            </span>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Fix your PDF page order
            <span className="text-amber-400"> in seconds</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            Intelligent auto-reordering with intuitive drag-and-drop editing. No
            uploads to external servers, no accounts required.
          </p>
        </div>

        {/* Upload Zone */}
        <DropZone />

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-16 grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Auto-Reorder"
            description="AI-powered page detection automatically suggests the correct order"
          />
          <FeatureCard
            icon={<GripVertical className="h-5 w-5" />}
            title="Drag & Drop"
            description="Intuitive visual editor to manually fine-tune page positions"
          />
          <FeatureCard
            icon={<Download className="h-5 w-5" />}
            title="Instant Export"
            description="Download your reorganized PDF instantly — no waiting"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-12 border-t border-slate-800">
        <p className="text-center text-sm text-slate-500">
          Built with Next.js, pdf-lib, and pdfjs-dist. All processing happens
          locally.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-sm">{description}</p>
    </div>
  );
}
