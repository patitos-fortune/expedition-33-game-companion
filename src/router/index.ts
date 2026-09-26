import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import CharactersView from '../views/CharactersView.vue'
import InventoryView from '../views/InventoryView.vue'
import BuildView from '../views/BuildView.vue'
import AnalyzeView from '../views/AnalyzeView.vue'
import SettingsView from '../views/SettingsView.vue'
import PartySummaryView from '../views/PartySummaryView.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/characters' },
  { path: '/characters', name: 'characters', component: CharactersView },
  { path: '/inventory', name: 'inventory', component: InventoryView },
  { path: '/build', name: 'build', component: BuildView },
  { path: '/party', name: 'party', component: PartySummaryView },
  { path: '/analyze', name: 'analyze', component: AnalyzeView },
  { path: '/settings', name: 'settings', component: SettingsView },
]

// Hash history: this app is opened from a local file/dev server with no
// backend routing, so hash-based routes avoid any need for server rewrites.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
