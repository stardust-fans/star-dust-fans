import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRenderer, defineComponent, h, nextTick, ref, ssrContextKey } from 'vue';
import { adminHasPermission } from '../src/shared/adminPermissions.js';

const state = vi.hoisted(() => ({ auth: null, fetch: vi.fn(), route: { name: 'songs' } }));
vi.mock('../src/admin/composables/useAdminAuth.js', () => ({ useAdminAuth: () => state.auth }));
vi.mock('../src/admin/composables/useAdminApi.js', () => ({ useAdminApi: () => ({ adminFetch: state.fetch }) }));
vi.mock('vue-router', () => ({ useRoute: () => state.route }));

import App from '../src/admin/App.vue';
import DailyModule from '../src/admin/modules/DailyModule.vue';
import PendingModule from '../src/admin/modules/PendingModule.vue';
import AdminsModule from '../src/admin/modules/AdminsModule.vue';

globalThis.Document = class Document {};
globalThis.ShadowRoot = class ShadowRoot {};
function node(type, text = '') {
  return { type, text, children: [], props: {}, listeners: {}, parent: null,
    addEventListener(name, callback) { this.listeners[name] = callback; },
    removeEventListener(name) { delete this.listeners[name]; },
    getRootNode() { return {}; },
    dispatch(name) { this.listeners[name]?.({ target: this }); },
  };
}
const renderer = createRenderer({
  createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
  setText: (el, text) => { el.text = text; }, setElementText: (el, text) => { el.text = text; el.children = []; },
  patchProp: (el, key, previous, value) => { el.props[key] = value; if (key === 'value') el._value = value; },
  insert: (el, parent, anchor) => { if (el.parent) { const i = el.parent.children.indexOf(el); if (i >= 0) el.parent.children.splice(i, 1); } el.parent = parent; const i = parent.children.indexOf(anchor); if (i < 0) parent.children.push(el); else parent.children.splice(i, 0, el); },
  remove: el => { const i = el.parent?.children.indexOf(el); if (i >= 0) el.parent.children.splice(i, 1); },
  parentNode: el => el.parent, nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] || null,
});
const find = (root, predicate) => [root, ...root.children.flatMap(child => find(child, predicate))].filter(predicate);
const text = root => root.text + root.children.map(text).join('');
const button = (root, label) => find(root, n => n.type === 'button' && text(n).includes(label))[0];
async function settle() { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick(); } }
function mount(component, stubs = {}) {
  const root = node('root');
  const app = renderer.createApp(component);
  app.provide(ssrContextKey, { modules: new Set() });
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  app.mount(root);
  return { root, unmount: () => app.unmount() };
}
function profile(permissions) {
  const admin = ref({ id: 'me', username: 'admin', groups: [], permissions });
  return { admin, token: ref('token'), isAuthenticated: ref(true), profileLoaded: ref(true), can: permission => adminHasPermission(admin.value, permission), fetchMe: vi.fn(async () => admin.value), logout: vi.fn() };
}
beforeEach(() => { state.fetch.mockReset(); state.route.name = 'songs'; state.auth = profile([]); });

describe('admin permission interface', () => {
  it('hides unauthorized navigation and never mounts its route', async () => {
    state.auth = profile(['daily:read']);
    let mounts = 0;
    const view = defineComponent({ setup() { mounts++; return () => h('div', 'protected module'); } });
    const link = defineComponent({ setup(_, { slots }) { return () => h('a', slots.default?.()); } });
    const mounted = mount(App, { RouterView: view, RouterLink: link });
    await settle();
    expect(text(mounted.root)).toContain('吸尘器日报');
    expect(text(mounted.root)).not.toContain('歌曲管理');
    expect(mounts).toBe(0);
    expect(text(mounted.root)).toContain('没有此页面的访问权限');
    state.auth.admin.value = { ...state.auth.admin.value, permissions: ['songs:read'] };
    await settle();
    expect(mounts).toBe(1);
    expect(text(mounted.root)).toContain('protected module');
    state.auth.admin.value = { ...state.auth.admin.value, permissions: ['daily:read'] };
    await settle();
    expect(text(mounted.root)).not.toContain('protected module');
    state.auth.isAuthenticated.value = false;
    await settle();
    expect(text(mounted.root)).toContain('管理员登录');
    state.auth.admin.value = { ...state.auth.admin.value, permissions: ['songs:read'] };
    state.auth.isAuthenticated.value = true;
    await settle();
    expect(text(mounted.root)).toContain('protected module');
    mounted.unmount();
  });

  it('renders read-only data without mutation controls', async () => {
    state.auth = profile(['daily:read', 'review:read', 'manage:read']);
    state.fetch.mockImplementation(async path => ({ '/admin/daily': [{ id: 1, title: '日报内容' }], '/admin/pending': [{ id: 2, type: 'fanart', title: '待审内容' }], '/admin/admins': [{ id: 'a', username: 'reader', groupIds: ['g'], groups: [{ id: 'g', name: '阅读组' }], permissions: ['daily:read'] }], '/admin/groups': [{ id: 'g', name: '阅读组', permissions: ['daily:read'] }] })[path]);
    for (const [component, expected] of [[DailyModule, '日报内容'], [PendingModule, '待审内容'], [AdminsModule, '阅读组']]) {
      const mounted = mount(component); await settle();
      expect(text(mounted.root)).toContain(expected);
      for (const label of ['添加', '新增', '编辑', '删除', '通过', '驳回']) expect(button(mounted.root, label)).toBeUndefined();
      expect(text(mounted.root)).not.toContain('从预设创建');
      mounted.unmount();
    }
  });

  it('creates an unsaved group from a preset and submits it once', async () => {
    state.auth = profile(['manage:write']);
    state.fetch.mockImplementation(async (path, options) => {
      if (options?.method === 'POST') return {};
      return path === '/admin/groups' ? [] : [];
    });
    const mounted = mount(AdminsModule); await settle();
    button(mounted.root, '新增权限组').props.onClick(); await settle();
    const select = find(mounted.root, n => n.type === 'select')[0];
    select.props.onChange({ target: { value: 'songs-admins' } }); await settle();
    expect(text(mounted.root)).toContain('歌曲数据 · 读取');
    expect(text(mounted.root)).toContain('歌曲数据 · 修改');
    expect(state.fetch.mock.calls.filter(([, opts]) => opts?.method)).toHaveLength(0);
    button(mounted.root, '保存').props.onClick(); await settle();
    const writes = state.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('/admin/groups');
    expect(JSON.parse(writes[0][1].body)).toEqual({ id: 'songs-admins', name: '歌曲区管理员', permissions: ['songs:write'] });
    mounted.unmount();
  });

  it('requires a new ID when cloning an existing preset and defaults new accounts to ordinary', async () => {
    state.auth = profile(['manage:write']);
    state.fetch.mockImplementation(async path => path === '/admin/groups' ? [{ id: 'ordinary', name: '普通用户', permissions: [] }] : []);
    const mounted = mount(AdminsModule); await settle();
    button(mounted.root, '新增账户').props.onClick(); await settle();
    const accountCheckbox = find(mounted.root, n => n.type === 'input' && n.props.type === 'checkbox')[0];
    expect(accountCheckbox.checked).toBe(true);
    button(mounted.root, '新增权限组').props.onClick(); await settle();
    find(mounted.root, n => n.type === 'select')[0].props.onChange({ target: { value: 'ordinary' } }); await settle();
    expect(text(mounted.root)).toContain('无后台权限');
    expect(text(mounted.root)).toContain('请填写新标识');
    const idInput = find(mounted.root, n => n.type === 'input' && n.props.placeholder === '权限组标识')[0];
    expect(idInput.value).toBe('');
    expect(state.fetch.mock.calls.filter(([, opts]) => opts?.method)).toHaveLength(0);
    mounted.unmount();
  });

  it('assigns multiple selected groups when saving an account', async () => {
    state.auth = profile(['manage:write']);
    state.fetch.mockImplementation(async (path, options) => {
      if (options?.method === 'POST') return {};
      if (path === '/admin/admins') return [{ id: 'a', username: 'editor', groupIds: ['g1'], groups: [{ id: 'g1', name: '第一组' }], permissions: [] }];
      if (path === '/admin/groups') return [{ id: 'g1', name: '第一组', permissions: [] }, { id: 'g2', name: '第二组', permissions: [] }];
      return {};
    });
    const mounted = mount(AdminsModule); await settle();
    button(mounted.root, '编辑').props.onClick(); await settle();
    const checkboxes = find(mounted.root, n => n.type === 'input' && n.props.type === 'checkbox');
    expect(checkboxes).toHaveLength(2);
    checkboxes[1].checked = true; checkboxes[1].dispatch('change'); await settle();
    button(mounted.root, '保存').props.onClick(); await settle();
    const [, options] = state.fetch.mock.calls.find(([path, opts]) => path === '/admin/admins/a' && opts?.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({ groupIds: ['g1', 'g2'] });
    mounted.unmount();
  });
});
