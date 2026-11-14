import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig(({mode})=>({base:'./',plugins:[react(),...(mode==='standalone'?[viteSingleFile()]:[])],server:{proxy:{'/api':'http://127.0.0.1:8000'}}}));
