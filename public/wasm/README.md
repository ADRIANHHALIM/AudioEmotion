# WASM Directory

ONNX Runtime Web WASM files will be copied here during build.

These files are automatically copied from `node_modules/onnxruntime-web/dist/`
by the `vite-plugin-static-copy` plugin configured in `vite.config.js`.

## Files

After running `npm run build`, this directory should contain:

- `ort-wasm.wasm`
- `ort-wasm-simd.wasm`
- `ort-wasm-threaded.wasm`
- `ort-wasm-simd-threaded.wasm`

The ONNX Runtime will automatically select the best WASM file based on
browser capabilities (SIMD support, threading support, etc.).
