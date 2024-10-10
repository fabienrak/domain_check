const express = require('express');
const multer = require('multer');
const fs = require('fs');
const whois = require('whois');
const path = require('path');
const XLSX = require('xlsx');
const ejs = require('ejs');
const bodyParser = require('body-parser');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const retryWhois = (domaine, retries = 3) => {
    return new Promise((resolve, reject) => {
        whois.lookup(domaine, (err, data) => {
            if (err && retries > 0) {
                console.log(`Retrying WHOIS for ${domaine}, attempts left: ${retries}`);
                setTimeout(() => retryWhois(domaine, retries - 1).then(resolve).catch(reject), 1000);
            } else if (err) {
                if (err.code === 'ENETUNREACH') {
                    console.error(`Network unreachable when checking ${domaine}:`, err);
                    resolve({ domaine, error: `Network unreachable for domain: ${domaine}` });
                } else {
                    console.error(`[-] ERROR ON WHOIS ${domaine}:`, err);
                    resolve({ domaine, error: `[-] ERREUR ON : ${domaine}: ${err.message}` });
                }
            } else {
                resolve(data);
            }
        });
    });
};

app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = req.file.path;
    req.setTimeout(300000);

    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const domaines = data.split('\n').filter(Boolean);

        const checkWhois = async (domaine) => {
            const data = await retryWhois(domaine);

            if (data.error) {
                return { domaine, error: data.error };
            }

            const emailRegex = /e-mail:\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
            const phoneRegex = /phone:\s+(\+?\d[\d\s.-]*)/g;
            const nameRegex = /contact:\s+([a-zA-Z\s]+)/g;
            const countryRegex = /address:\s+(.+)/g;

            let emails = [];
            let phones = [];
            let names = [];
            let countries = [];

            let match;
            while ((match = emailRegex.exec(data)) !== null) {
                emails.push(match[1]);
            }

            while ((match = phoneRegex.exec(data)) !== null) {
                phones.push(match[1]);
            }

            while ((match = nameRegex.exec(data)) !== null) {
                names.push(match[1]);
            }

            while ((match = countryRegex.exec(data)) !== null) {
                countries.push(match[1]);
            }

            return {
                domaine,
                emails: emails.join(', '),
                phones: phones.join(', '),
                names: names.join(', '),
                countries: countries.join(', ')
            };
        };

        const whoisResults = await Promise.all(domaines.map(checkWhois));

        res.render('data', { results: whoisResults });

    } catch (err) {
        console.error('ERREUR LECTURE FICHIER :', err);
        res.status(500).send('[-] ERROR ON UPLOAD');
    }
});

app.post('/export', (req, res) => {
    const results = JSON.parse(req.body.results);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(results);

    XLSX.utils.book_append_sheet(wb, ws, 'Results');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', `attachment; filename=results.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(excelBuffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur running on : ${PORT}`);
});