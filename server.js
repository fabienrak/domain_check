const express = require('express');
const multer = require('multer');
const fs = require('fs');
const whois = require('whois');
const path = require('path');
const XLSX = require('xlsx');
const ejs = require('ejs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(express.json({limit: '150mb'}));
app.use(express.urlencoded({limit: '150mb'}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    // res.sendFile(path.join(__dirname, 'public', 'index.html'));
    res.sendFile(path.join(__dirname,  'index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
    const filePath = req.file.path;

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('ERREUR UPLOAD FILE :', err);
            res.status(500).send('[-] ERROR ON UPLOAD');
            return;
        }

        const domaines = data.split('\n').filter(Boolean);
        const results = [];

        const checkWhois = (domaine) => {
            whois.lookup(domaine, (err, data) => {
                if (err) {
                    console.error(`[-] ERROR ON WHOIS ${domaine}:`, err);
                    results.push({ domaine, error: `[-] ERREUR ON : ${domaine}: ${err.message}` });
                } else {
                    const emailRegex = /e-mail:\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                    const phoneRegex = /phone:\s+(\+?\d[\d\s.-]*)/g;
                    const nameRegex = /contact:\s+([a-zA-Z\s]+)/g;
                    const countryRegex = /country:\s+([a-zA-Z]{2})/g;

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

                    results.push({
                        domaine,
                        emails: emails.join(', '),
                        phones: phones.join(', '),
                        names: names.join(', '),
                        countries: countries.join(', ')
                    });
                }

                if (results.length === domaines.length) {
                    res.render('resultat', { results });
                }
            });
        };

        domaines.forEach(checkWhois);
    });
});

app.post('/export', (req, res) => {
    const results = JSON.parse(req.body.results);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(results);

    XLSX.utils.book_append_sheet(wb, ws, 'Results-check');

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename=results.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    console.log('excelBuffer : +++++++ ', excelBuffer)
    res.send(excelBuffer);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[+] SEREVER RUNNING ON : ${PORT}`);
});
