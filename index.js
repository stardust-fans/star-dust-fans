const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// 托管静态文件
app.use(express.static('public'));

// 解析 JSON 请求体
app.use(express.json());

// 代理所有 /api 请求到 Worker
app.use('/api', async (req, res) => {
    try {
        const target = `http://127.0.0.1:8787${req.originalUrl}`;
        console.log('🔁 代理:', target, '方法:', req.method);

        // 构建转发请求
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization || '',  // ← 加这一行！
            },
        };

        // 如果有请求体，转发过去
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(target, fetchOptions);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('❌ 代理错误:', error.message);
        res.status(500).json({ error: '代理请求失败', detail: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Express 已启动: http://localhost:${PORT}`);
});