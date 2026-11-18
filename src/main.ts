import { createApp } from "vue";
import App from "./App.vue";
import './style.css';
import {i18n} from "@/i18n.ts";
import {createRouter, createWebHashHistory} from "vue-router";

import Main from "./Main.vue";

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Main
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

createApp(App).use(i18n).use(router).mount("#app");
