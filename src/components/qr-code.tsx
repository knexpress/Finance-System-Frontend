'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCodeLib from 'qrcode';

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export default function QRCode({ value, size = 200, className = '' }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      const canvas = canvasRef.current;
      
      // Clear any previous error
      setError(null);
      
      // Generate QR code using qrcode library
      QRCodeLib.toCanvas(canvas, value, {
        width: size,
        margin: 4, // Increased margin for better quiet zone
        color: {
          dark: '#000000',  // Black modules
          light: '#FFFFFF'  // White background
        },
        errorCorrectionLevel: 'H' // High error correction for better reliability
      }).catch((err) => {
        console.error('Error generating QR code:', err);
        setError('Failed to generate QR code');
      });
    }
  }, [value, size]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 border border-gray-300 rounded ${className}`} style={{ width: size, height: size }}>
        <p className="text-xs text-gray-500 text-center p-2">{error}</p>
      </div>
    );
  }

  return (
    <div className={`inline-block ${className}`}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ 
          imageRendering: 'crisp-edges',
          display: 'block',
          maxWidth: '100%',
          height: 'auto'
        }}
        aria-label={`QR Code for ${value}`}
      />
    </div>
  );
}
