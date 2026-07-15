import { createApp } from 'vue';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/loading/style/css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { setupHttpInterceptors } from './utils/setupHttp';
import './assets/css/interaction-polish.css';

setupHttpInterceptors();

const app = createApp(App);

// Icon strings are used across old templates, so icons stay globally available.
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
}

app.use(router);
app.mount('#app');
