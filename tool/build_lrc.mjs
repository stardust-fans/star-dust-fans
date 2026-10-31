import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';

const REPOSITORY = 'lsy-404/LRC';
const SITE = 'https://lrc.wuyilingwei.com';
const DATA_DIR = resolve(import.meta.dirname, '../static/data');
const PUBLIC_PATH = '/data/lrc';
const filename = z.string().min(1).refine(value => !/[\\/\u0000-\u001f]/.test(value) && !['.', '..'].includes(value));
const albumSchema = z.looseObject({
    slug: z.string().regex(/^[A-Za-z0-9_-]+$/),
    folder: filename,
    name: z.string().min(1),
    year: z.string(),
    vocal: z.array(z.string()),
    produce: z.array(z.string()),
    lyric_maker: z.array(z.string()),
    songs: z.array(z.looseObject({ title: filename })),
    song_count: z.number().int().nonnegative(),
}).refine(album => album.song_count === album.songs.length && new Set(album.songs.map(song => song.title)).size === album.song_count);
const catalogSchema = z.object({
    count: z.number().int().positive(),
    albums: z.array(albumSchema).min(1),
}).refine(catalog => catalog.count === catalog.albums.length && new Set(catalog.albums.map(album => album.slug)).size === catalog.count);

async function download(url, headers = {}) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`LRC 下载失败：${response.status} ${url}`);
    return new Uint8Array(await response.arrayBuffer());
}

const headers = { 'User-Agent': 'star-dust-fans', Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const revision = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).parse(
    JSON.parse(new TextDecoder().decode(await download(`https://api.github.com/repos/${REPOSITORY}/commits/main`, headers))),
).sha;
const raw = `https://raw.githubusercontent.com/${REPOSITORY}/${revision}`;
const [catalogBytes, license] = await Promise.all([
    download(`${raw}/docs/.vuepress/public/api/albums.json`),
    download(`${raw}/LICENSE`),
]);
const catalog = catalogSchema.parse(JSON.parse(new TextDecoder().decode(catalogBytes)));
const source = {
    name: 'LRC · V宇宙词站',
    site: SITE,
    repository: `https://github.com/${REPOSITORY}`,
    revision,
    catalog_url: `${raw}/docs/.vuepress/public/api/albums.json`,
    license: 'CC BY-NC-SA 4.0',
    license_url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    changes: '歌词及专辑 ZIP 保持原样；目录添加尘站下载地址，完整包按专辑目录整理歌词。',
};
const attribution = strToU8(`${source.name}\n${SITE}\n来源：${source.repository}/tree/${revision}\n许可：${source.license} ${source.license_url}\n${source.changes}\n`);
const fullArchive = Object.create(null);
fullArchive['LICENSE.txt'] = license;
fullArchive['ATTRIBUTION.txt'] = attribution;
const albums = new Array(catalog.count);

await mkdir(DATA_DIR, { recursive: true });
const staging = await mkdtemp(resolve(DATA_DIR, '.lrc-'));
try {
    await mkdir(resolve(staging, 'albums'));
    await mkdir(resolve(staging, 'lyrics'));
    let nextAlbum = 0;
    const results = await Promise.allSettled(Array.from({ length: Math.min(6, catalog.count) }, async () => {
        while (nextAlbum < catalog.count) {
            const index = nextAlbum++;
            const album = catalog.albums[index];
            const zip = await download(`${raw}/pack/${encodeURIComponent(album.folder)}.zip`);
            const files = unzipSync(zip, { filter: file => file.name.endsWith('.lrc') });
            await writeFile(resolve(staging, 'albums', `${album.slug}.zip`), zip);
            await mkdir(resolve(staging, 'lyrics', album.slug));
            const songs = [];
            for (const song of album.songs) {
                const name = `${song.title}.lrc`;
                const resourceName = `${createHash('sha256').update(name).digest('hex')}.lrc`;
                const contents = files[name];
                if (!contents?.length) throw new Error(`LRC 专辑包缺少歌词：${album.folder}/${name}`);
                await writeFile(resolve(staging, 'lyrics', album.slug, resourceName), contents);
                fullArchive[`${album.folder}/${name}`] = contents;
                songs.push({ ...song, download_url: `${PUBLIC_PATH}/lyrics/${album.slug}/${resourceName}` });
            }
            albums[index] = {
                ...album,
                songs,
                cover: album.cover ? new URL(album.cover, SITE).href : null,
                detail_url: `${raw}/docs/.vuepress/public/api/albums/${album.slug}.json`,
                source_url: `${SITE}/albums/${album.slug}.html`,
                download_url: `${PUBLIC_PATH}/albums/${album.slug}.zip`,
                download_bytes: zip.length,
                download_sha256: createHash('sha256').update(zip).digest('hex'),
            };
        }
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    const songCount = albums.reduce((total, album) => total + album.song_count, 0);
    if (!songCount) throw new Error('LRC 数据没有可下载歌词');
    const entries = Object.fromEntries(Object.keys(fullArchive).sort().map(name => [name, [fullArchive[name], { mtime: new Date(2000, 0, 1) }]]));
    const archive = zipSync(entries, { level: 6 });
    const output = {
        source,
        count: catalog.count,
        song_count: songCount,
        download_url: `${PUBLIC_PATH}/lrc-lyrics.zip`,
        download_bytes: archive.length,
        download_sha256: createHash('sha256').update(archive).digest('hex'),
        albums,
    };
    await Promise.all([
        writeFile(resolve(staging, 'catalog.json'), `${JSON.stringify(output)}\n`),
        writeFile(resolve(staging, 'LICENSE.txt'), license),
        writeFile(resolve(staging, 'ATTRIBUTION.txt'), attribution),
        writeFile(resolve(staging, 'lrc-lyrics.zip'), archive),
    ]);
    await rm(resolve(DATA_DIR, 'lrc'), { recursive: true, force: true });
    await rename(staging, resolve(DATA_DIR, 'lrc'));
    console.log(`LRC 构建完成：${catalog.count} 张专辑，${songCount} 首歌词（${revision.slice(0, 7)}）`);
} finally {
    await rm(staging, { recursive: true, force: true });
}
