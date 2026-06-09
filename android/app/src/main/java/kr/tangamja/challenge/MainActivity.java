package kr.tangamja.challenge;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String APP_HOST = "tangamja.local";
    private static final String APP_ORIGIN = "https://" + APP_HOST;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        requestRuntimePermissions();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.addJavascriptInterface(new NativeBridge(new RideStore(this)), "TangamjaNativeApi");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });
        webView.setWebViewClient(new LocalAssetClient());
        webView.loadUrl(APP_ORIGIN + "/index.html?apk=1");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(
                new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                    Manifest.permission.POST_NOTIFICATIONS
                },
                1001
            );
            return;
        }

        requestPermissions(
            new String[] {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            },
            1001
        );
    }

    public static class NativeBridge {
        private final RideStore store;

        NativeBridge(RideStore store) {
            this.store = store;
        }

        @JavascriptInterface
        public String request(String path, String method, String body) {
            return store.handleRequest(path, method, body);
        }
    }

    private class LocalAssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!APP_HOST.equals(uri.getHost())) {
                return super.shouldInterceptRequest(view, request);
            }

            String path = uri.getPath();
            if (path == null || "/".equals(path)) {
                path = "/index.html";
            }
            if (path.startsWith("/api/")) {
                return textResponse(404, "application/json", "{\"error\":\"Use TangamjaNativeApi bridge\"}");
            }

            String assetPath = "www" + path;
            try {
                InputStream stream = getAssets().open(assetPath);
                return assetResponse(mimeType(path), stream);
            } catch (IOException ignored) {
                return textResponse(404, "text/plain", "Not found");
            }
        }

        private WebResourceResponse assetResponse(String mimeType, InputStream stream) {
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", APP_ORIGIN);
            headers.put("Cache-Control", "no-cache");
            WebResourceResponse response = new WebResourceResponse(mimeType, "UTF-8", stream);
            response.setResponseHeaders(headers);
            return response;
        }

        private WebResourceResponse textResponse(int status, String mimeType, String body) {
            InputStream stream = new java.io.ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            WebResourceResponse response = new WebResourceResponse(mimeType, "UTF-8", stream);
            response.setStatusCodeAndReasonPhrase(status, status == 404 ? "Not Found" : "OK");
            return response;
        }

        private String mimeType(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".json")) return "application/json";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".webmanifest")) return "application/manifest+json";
            return "application/octet-stream";
        }
    }
}
