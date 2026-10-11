import { createRenderer } from 'vue';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useSongList } from '../src/shared/useSongList.js';

const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null,
});
let app;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function mount(request) {
    let list;
    app = renderer.createApp({
        setup() {
            list = useSongList({ pageSize: 20, request });
            return () => null;
        },
    });
    app.mount({});
    return list;
}

afterEach(() => app?.unmount());

describe('Song list navigation', () => {
    it('keeps the current result when an older request finishes later', async () => {
        let finishOld;
        const oldRequest = new Promise(resolve => { finishOld = resolve; });
        const request = vi.fn()
            .mockReturnValueOnce(oldRequest).mockResolvedValueOnce({ total: 1 })
            .mockResolvedValueOnce([{ id: 2 }]).mockResolvedValueOnce({ total: 1 });
        const list = mount(request);
        list.sort.value = 'oldest';
        await settle();
        finishOld([{ id: 1 }]);
        await settle();
        expect(list.songs.value).toEqual([{ id: 2 }]);
        expect(list.loading.value).toBe(false);
    });

    it('returns to a valid page after deleting the last song on the final page', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce({ total: 21 })
            .mockResolvedValueOnce([{ id: 21 }]).mockResolvedValueOnce({ total: 21 })
            .mockResolvedValueOnce([]).mockResolvedValueOnce({ total: 20 })
            .mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce({ total: 20 });
        const list = mount(request);
        await settle();
        list.page.value = 2;
        await settle();
        await list.reload();
        await settle();
        expect(list.page.value).toBe(1);
        expect(list.pageCount.value).toBe(1);
        expect(list.songs.value).toEqual([{ id: 1 }]);
    });

    it('shows a failed request and clears the error after a successful retry', async () => {
        const request = vi.fn()
            .mockRejectedValueOnce(new Error('临时连接中断')).mockResolvedValueOnce({ total: 1 })
            .mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce({ total: 1 });
        const list = mount(request);
        await settle();
        expect(list.error.value).toBe('临时连接中断');
        expect(list.loading.value).toBe(false);
        await list.reload();
        expect(list.error.value).toBe('');
        expect(list.songs.value).toEqual([{ id: 1 }]);
    });
});
