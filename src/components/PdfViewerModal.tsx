import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../theme/colors';
import { getCachedPdfJs } from '../utils/pdfPlanService';

interface PdfViewerModalProps {
  visible: boolean;
  onClose: () => void;
  fileUri: string | null;
  fileName?: string;
  title?: string;
  onShareOrExternal?: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  visible,
  onClose,
  fileUri,
  fileName,
  title,
  onShareOrExternal,
}) => {
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localScript, setLocalScript] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (visible && fileUri) {
      setLoading(true);
      setPdfBase64(null);
      setTotalPages(null);

      // 1. Önbellekteki PDF.js'i al
      getCachedPdfJs().then((script) => {
        if (isMounted && script) {
          setLocalScript(script);
        }
      });

      // 2. PDF dosyasını base64 olarak oku
      FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      })
        .then((b64) => {
          if (isMounted) {
            setPdfBase64(b64);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error('PdfViewerModal read error:', err);
          if (isMounted) {
            setLoading(false);
            Alert.alert(
              'PDF Hatası',
              'PDF dosyası diskten okunamadı. Dosya silinmiş veya bozulmuş olabilir.'
            );
          }
        });
    } else {
      setPdfBase64(null);
      setLoading(false);
      setTotalPages(null);
    }

    return () => {
      isMounted = false;
    };
  }, [visible, fileUri]);

  const generateHtml = (base64: string, scriptContent: string | null) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
        <title>PDF Viewer</title>
        <style>
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          html, body {
            margin: 0;
            padding: 0;
            background-color: #0F172A;
            min-height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          #viewer-header {
            position: sticky;
            top: 0;
            z-index: 100;
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }
          .badge {
            background: #3B82F6;
            color: #FFFFFF;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 6px;
            letter-spacing: 0.5px;
          }
          .page-count {
            font-size: 12px;
            color: #94A3B8;
            font-weight: 600;
          }
          #container {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 12px 8px 30px 8px;
            gap: 14px;
          }
          .page-card {
            position: relative;
            background: #FFFFFF;
            box-shadow: 0 4px 18px rgba(0,0,0,0.45);
            border-radius: 6px;
            overflow: hidden;
            width: 100%;
            max-width: 900px;
          }
          canvas {
            display: block;
            width: 100%;
            height: auto;
          }
          .page-tag {
            position: absolute;
            bottom: 6px;
            right: 8px;
            background: rgba(15, 23, 42, 0.75);
            color: #F8FAFC;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 4px;
            pointer-events: none;
          }
          #loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            text-align: center;
            color: #94A3B8;
          }
          .spinner {
            width: 38px;
            height: 38px;
            border: 3px solid rgba(255,255,255,0.15);
            border-top-color: #38BDF8;
            border-radius: 50%;
            animation: spin 0.9s linear infinite;
            margin-bottom: 14px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .error-box {
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.35);
            color: #FCA5A5;
            padding: 18px;
            border-radius: 10px;
            margin: 30px auto;
            max-width: 90%;
            text-align: center;
            font-size: 14px;
            line-height: 1.5;
          }
        </style>
        ${
          scriptContent
            ? `<script>${scriptContent}</script>`
            : `<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>`
        }
      </head>
      <body>
        <div id="viewer-header" style="display: none;">
          <span class="badge">YILLIK PLAN</span>
          <span id="page-count-text" class="page-count"></span>
        </div>

        <div id="loading">
          <div class="spinner"></div>
          <div style="font-size: 14px; font-weight: 600; color: #E2E8F0;">PDF Hazırlanıyor...</div>
          <div style="font-size: 12px; color: #64748B; margin-top: 6px;">Sayfalar işleniyor, lütfen bekleyin</div>
        </div>

        <div id="container" style="display: none;"></div>

        <script>
          function b64ToUint8(b64) {
            var raw = window.atob(b64);
            var arr = new Uint8Array(raw.length);
            for (var i = 0; i < raw.length; i++) {
              arr[i] = raw.charCodeAt(i);
            }
            return arr;
          }

          async function render() {
            var loadingDiv = document.getElementById('loading');
            var container = document.getElementById('container');
            var header = document.getElementById('viewer-header');
            var pageCountText = document.getElementById('page-count-text');

            try {
              if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF motoru yüklenemedi. Lütfen internet bağlantınızı kontrol ediniz veya dış uygulama butonunu kullanınız.');
              }

              try {
                // Blob worker to safely bypass cross-origin worker restriction
                var workerBlob = new Blob([
                  "importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');"
                ], { type: 'application/javascript' });
                pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
              } catch (wErr) {
                try {
                  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                } catch (e) {
                  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                }
              }

              var pdfData = b64ToUint8("${base64}");
              var loadingTask = pdfjsLib.getDocument({
                data: pdfData,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
              });

              var pdf = await loadingTask.promise;
              var numPages = pdf.numPages;

              loadingDiv.style.display = 'none';
              header.style.display = 'flex';
              container.style.display = 'flex';
              pageCountText.innerText = 'Toplam ' + numPages + ' Sayfa';

              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAGES', totalPages: numPages }));
              }

              for (var pageNum = 1; pageNum <= numPages; pageNum++) {
                var page = await pdf.getPage(pageNum);
                var defViewport = page.getViewport({ scale: 1.0 });
                var screenWidth = Math.max(window.innerWidth, screen.width || 360) - 20;
                var baseScale = screenWidth / defViewport.width;
                var renderScale = Math.max(baseScale * 1.5, 1.5);
                var viewport = page.getViewport({ scale: renderScale });

                var card = document.createElement('div');
                card.className = 'page-card';

                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';

                var tag = document.createElement('div');
                tag.className = 'page-tag';
                tag.innerText = pageNum + ' / ' + numPages;

                card.appendChild(canvas);
                card.appendChild(tag);
                container.appendChild(card);

                await page.render({
                  canvasContext: ctx,
                  viewport: viewport
                }).promise;
              }
            } catch (err) {
              console.error(err);
              loadingDiv.innerHTML =
                '<div class="error-box">' +
                  '<div style="font-weight: 700; margin-bottom: 6px; font-size: 15px;">PDF Görüntülenemedi</div>' +
                  '<div>' + (err.message || String(err)) + '</div>' +
                  '<div style="margin-top: 10px; font-size: 12px; color: #CBD5E1;">Aşağıdaki "Dış Uygulamada Aç / Paylaş" butonunu kullanarak PDF\\'i doğrudan cihazınızdaki okuyucuda açabilirsiniz.</div>' +
                '</div>';
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: err.message }));
              }
            }
          }

          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            render();
          } else {
            window.addEventListener('DOMContentLoaded', render);
          }
        </script>
      </body>
      </html>
    `;
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          {/* HEADER */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Text style={styles.modalClassTag}>PDF DOKÜMANI</Text>
                {totalPages !== null && (
                  <View style={styles.pageBadge}>
                    <Text style={styles.pageBadgeText}>{totalPages} Sayfa</Text>
                  </View>
                )}
              </View>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {fileName || title || 'Yıllık Plan PDF'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* WEBVIEW CONTAINER */}
          <View style={styles.viewerContent}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>PDF Hazırlanıyor...</Text>
              </View>
            ) : pdfBase64 ? (
              <WebView
                originWhitelist={['*']}
                source={{ html: generateHtml(pdfBase64, localScript) }}
                style={{ flex: 1, backgroundColor: '#0F172A' }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowFileAccess={true}
                allowUniversalAccessFromFileURLs={true}
                allowFileAccessFromFileURLs={true}
                scalesPageToFit={true}
                scrollEnabled={true}
                bounces={false}
                showsVerticalScrollIndicator={true}
                startInLoadingState={false}
                mixedContentMode="always"
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'PAGES' && typeof data.totalPages === 'number') {
                      setTotalPages(data.totalPages);
                    }
                  } catch (e) {
                    // Ignore non-json messages
                  }
                }}
              />
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.warning} />
                <Text style={styles.emptyText}>
                  PDF verisi okunamadı.
                </Text>
              </View>
            )}
          </View>

          {/* FOOTER ACTIONS */}
          <View style={styles.modalFooter}>
            {onShareOrExternal && (
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={onShareOrExternal}
                activeOpacity={0.8}
              >
                <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                <Text style={styles.shareBtnText}>Dış Uygulamada Aç / Paylaş</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '90%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalClassTag: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  pageBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  pageBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  viewerContent: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#0F172A',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0F172A',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 12,
    textAlign: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
