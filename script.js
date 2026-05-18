// ==========================================================================
// 1. DATABASE RECONCILIATION & INITIALIZATION
// ==========================================================================
let sysDatabase = JSON.parse(localStorage.getItem('pakchill_enterprise_db_v5.2')) || {
    menu: [
        { id: 'm1', name: 'PACHOY', price: 15000 },
        { id: 'm2', name: 'NANAS', price: 12000 }
    ],
    bundles: [],
    vouchers: [
        { code: 'PAKCHILLSEHAT', nominal: 5000, type: 'Voucher' }
    ],
    rekening: [
        { bank: 'BCA', nomor: '8410923121 a/n PT PAKCHILL' },
        { bank: 'GoPay', nomor: '081234567890 a/n PAKCHILL INDO' }
    ],
    members: [
        { name: 'APRIL', wa: '0812', poin: 10 }
    ],
    transactions: [],
    lastOrderDate: new Date().toDateString(),
    currentOrderSeq: 101
};

// Auto Reset Nomor Urut Order Setiap Pergantian Hari
const todayStr = new Date().toDateString();
if (sysDatabase.lastOrderDate !== todayStr) {
    sysDatabase.currentOrderSeq = 101;
    sysDatabase.lastOrderDate = todayStr;
    localStorage.setItem('pakchill_enterprise_db_v5.2', JSON.stringify(sysDatabase));
}

let activeRole = null;
let activeCart = [];
let activeMemberObj = null;
let chartInstanceGlobal = null;

function saveToStorage() {
    localStorage.setItem('pakchill_enterprise_db_v5.2', JSON.stringify(sysDatabase));
}

// ==========================================================================
// 2. OTENTIKASI KASIR & OWNER
// ==========================================================================
function executeAuthentication() {
    const pinInput = document.getElementById('sys-pin-access');
    if (!pinInput) return;
    const pin = pinInput.value.trim();

    if (pin === '123') {
        activeRole = 'kasir';
        document.getElementById('txt-nav-role-label').innerText = 'STAFF KASIR';
        document.getElementById('badge-status-role').innerText = 'Staff Kasir';
        document.getElementById('badge-status-role').style.background = '#2d5a27';
        document.getElementById('view-segment-kasir').style.display = 'grid';
        document.getElementById('view-segment-owner').style.display = 'none';
        unlockInterface();
    } else if (pin === '000') {
        activeRole = 'owner';
        document.getElementById('txt-nav-role-label').innerText = 'OWNER CONTROL';
        document.getElementById('badge-status-role').innerText = 'Owner Control';
        document.getElementById('badge-status-role').style.background = '#5856d6';
        document.getElementById('view-segment-kasir').style.display = 'grid';
        document.getElementById('view-segment-owner').style.display = 'block';
        unlockInterface();
        renderOwnerDashboardMetrics();
    } else {
        alert('PIN Salah! Akses Sistem Terkunci.');
    }
}

function unlockInterface() {
    document.getElementById('login-screen-overlay').style.display = 'none';
    document.getElementById('main-app-layer').style.display = 'block';
    document.getElementById('sys-pin-access').value = '';
    document.getElementById('txt-live-order-number').innerText = `Order #: ${sysDatabase.currentOrderSeq}`;
    
    renderKatalogKasir();
    renderCartUI();
    renderHistoryTable();
    renderMemberTable();
    calculateLiveClosingDashboard();
}

function triggerSystemLogout() {
    activeRole = null;
    activeCart = [];
    activeMemberObj = null;
    document.getElementById('main-app-layer').style.display = 'none';
    document.getElementById('login-screen-overlay').style.display = 'flex';
}

// ==========================================================================
// 3. OPERASIONAL KATALOG & KERANJANG KASIR
// ==========================================================================
function renderKatalogKasir() {
    const target = document.getElementById('katalog-render-target');
    if (!target) return;
    target.innerHTML = '';

    sysDatabase.menu.forEach(item => {
        target.innerHTML += `
            <div class="product-item-card" onclick="pushItemToCart('${item.name}', ${item.price})">
                <div style="font-weight:900; font-size:15px; color:var(--pakchill-green-dark);">${item.name}</div>
                <div style="color:var(--pakchill-green-soft); font-weight:700; margin-top:5px;">Rp ${item.price.toLocaleString('id-ID')}</div>
            </div>`;
    });

    sysDatabase.bundles.forEach(bundle => {
        target.innerHTML += `
            <div class="product-item-card" onclick="pushItemToCart('${bundle.name}', ${bundle.price})">
                <span class="badge-bundling-tag">Paket</span>
                <div style="font-weight:900; font-size:14px; color:#ff9500; margin-top:10px;">${bundle.name}</div>
                <div style="color:var(--pakchill-green-soft); font-weight:700; margin-top:5px;">Rp ${bundle.price.toLocaleString('id-ID')}</div>
            </div>`;
    });
}

function pushItemToCart(name, price) {
    activeCart.push({ name, price, uid: Date.now() + Math.random() });
    renderCartUI();
}

function removeItemFromCart(uid) {
    activeCart = activeCart.filter(item => item.uid !== uid);
    renderCartUI();
}

function renderCartUI() {
    const container = document.getElementById('cart-items-wrapper');
    if (!container) return;
    container.innerHTML = '';

    if (activeCart.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; font-size:13px; padding:20px;">Keranjang belanja kosong.</p>';
        document.getElementById('txt-subtotal-val').innerText = 'Rp 0';
        document.getElementById('txt-grand-total-display').innerText = 'Rp 0';
        return;
    }

    activeCart.forEach(item => {
        container.innerHTML += `
            <div class="cart-item-row">
                <div style="width: 45%; font-weight:bold; font-size:13px;">${item.name}</div>
                <div style="width: 35%; text-align: right; font-size:13px; color:#333;">Rp ${item.price.toLocaleString('id-ID')}</div>
                <div style="width: 20%; text-align: right;">
                    <button onclick="removeItemFromCart(${item.uid})" style="width:auto; margin:0; padding:3px 8px; background:#ff3b30; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;"> ✕ </button>
                </div>
            </div>`;
    });
    recalculateCartTotals();
}

function recalculateCartTotals() {
    let subtotal = activeCart.reduce((sum, item) => sum + item.price, 0);
    document.getElementById('txt-subtotal-val').innerText = 'Rp ' + subtotal.toLocaleString('id-ID');

    let diskonRaw = document.getElementById('kasir-input-diskon').value.trim();
    let voucherRaw = document.getElementById('kasir-input-voucher').value.trim();
    let nilaiDiskon = 0;
    let nilaiVoucher = 0;

    // Cek diskon berdasarkan database kupon atau nilai nominal langsung
    if (diskonRaw !== '' && diskonRaw !== '0') {
        let match = sysDatabase.vouchers.find(v => v.code.toUpperCase() === diskonRaw.toUpperCase() && v.type === 'Diskon');
        nilaiDiskon = match ? match.nominal : (parseInt(diskonRaw) || 0);
    }
    // Cek voucher berdasarkan database kupon atau nilai nominal langsung
    if (voucherRaw !== '' && voucherRaw !== '0') {
        let match = sysDatabase.vouchers.find(v => v.code.toUpperCase() === voucherRaw.toUpperCase() && v.type === 'Voucher');
        nilaiVoucher = match ? match.nominal : (parseInt(voucherRaw) || 0);
    }

    let grandTotal = subtotal - nilaiDiskon - nilaiVoucher;
    if (grandTotal < 0) grandTotal = 0;

    document.getElementById('txt-grand-total-display').innerText = 'Rp ' + grandTotal.toLocaleString('id-ID');
    calculateCashReturn();
}

// ==========================================================================
// 4. REGISTRASI MEMBER & REKENING PEMBAYARAN
// ==========================================================================
function executeLiveSearchMember() {
    const keyword = document.getElementById('kasir-search-member').value.toUpperCase();
    const box = document.getElementById('kasir-member-status-box');
    
    if(!keyword) {
        box.innerHTML = '';
        activeMemberObj = null;
        return;
    }

    let match = sysDatabase.members.find(m => m.name.toUpperCase().includes(keyword) || m.wa.includes(keyword));
    if(match) {
        activeMemberObj = match;
        box.innerHTML = `<span style="color:#34c759;">✓ Member Ditemukan: ${match.name} [Poin: ${match.poin}]</span>`;
    } else {
        activeMemberObj = null;
        box.innerHTML = '<span style="color:#ff3b30;">✗ Member Tidak Ditemukan</span>';
    }
}

function registerFastMemberFromKasir() {
    const name = document.getElementById('kasir-fast-name').value.trim();
    const wa = document.getElementById('kasir-fast-wa').value.trim();

    if(!name || !wa) { alert('Lengkapi Nama dan WA Member!'); return; }
    if(sysDatabase.members.some(m => m.wa === wa)) { alert('Nomor WA sudah terdaftar!'); return; }

    sysDatabase.members.push({ name, wa, poin: 0 });
    saveToStorage();
    document.getElementById('kasir-search-member').value = wa;
    executeLiveSearchMember();
    renderMemberTable();

    document.getElementById('kasir-fast-name').value = '';
    document.getElementById('kasir-fast-wa').value = '';
    alert('Member Berhasil Didaftarkan Resmi!');
}

function handlePaymentDropdownBranching() {
    const method = document.getElementById('kasir-select-paymethod').value;
    document.getElementById('wrapper-sub-cash').style.display = (method === 'Cash') ? 'block' : 'none';
    document.getElementById('wrapper-sub-qris').style.display = (method === 'QRIS') ? 'block' : 'none';
    document.getElementById('wrapper-sub-transfer').style.display = (method === 'Transfer') ? 'block' : 'none';

    if(method === 'Transfer') {
        const sel = document.getElementById('sub-target-transfer');
        sel.innerHTML = '';
        sysDatabase.rekening.forEach((r, idx) => {
            sel.innerHTML += `<option value="${idx}">${r.bank}</option>`;
        });
        updateLiveRekeningInfo();
    }
}

function updateLiveRekeningInfo() {
    const idx = document.getElementById('sub-target-transfer').value;
    const box = document.getElementById('live-rekening-info-box');
    if(idx !== '' && sysDatabase.rekening[idx]) {
        box.innerText = `Tujuan Transfer: ${sysDatabase.rekening[idx].nomor}`;
    } else {
        box.innerText = 'Belum ada data rekening.';
    }
}

function calculateCashReturn() {
    let rawTotal = document.getElementById('txt-grand-total-display').innerText.replace(/[^0-9]/g, '');
    let total = parseInt(rawTotal) || 0;
    let uang = parseInt(document.getElementById('kasir-cash-input-uang').value) || 0;
    let kembalian = uang - total;

    document.getElementById('cash-return-info').innerText = 'Kembalian: Rp ' + (kembalian < 0 ? 0 : kembalian).toLocaleString('id-ID');
}

// ==========================================================================
// 5. PROSES TRANSAKSI & PENYELESAIAN FINASIAL
// ==========================================================================
function finalizeTransactionReceipt(type) {
    if(activeCart.length === 0) { alert('Keranjang masih kosong!'); return; }
    
    let rawTotal = document.getElementById('txt-grand-total-display').innerText.replace(/[^0-9]/g, '');
    let grandTotal = parseInt(rawTotal) || 0;

    let subtotal = activeCart.reduce((sum, item) => sum + item.price, 0);
    let diskonRaw = document.getElementById('kasir-input-diskon').value;
    let voucherRaw = document.getElementById('kasir-input-voucher').value;
    let payMethod = document.getElementById('kasir-select-paymethod').value;

    if(payMethod === 'Cash') {
        let uang = parseInt(document.getElementById('kasir-cash-input-uang').value) || 0;
        if(uang < grandTotal) { alert('Uang pembayaran tidak cukup!'); return; }
    }

    const orderNum = sysDatabase.currentOrderSeq++;
    const transactionId = 'TRX-' + Date.now().toString().slice(-6);
    const timestamp = new Date().toISOString();

    // Akumulasi Poin Member (+1 poin per item belanja jika terdaftar) 
    let customerName = 'Pelanggan Umum';
    if(activeMemberObj) {
        customerName = activeMemberObj.name;
        let memberIdx = sysDatabase.members.findIndex(m => m.wa === activeMemberObj.wa);
        if(memberIdx !== -1) {
            sysDatabase.members[memberIdx].poin += activeCart.length;
        }
    }

    // Rekam Array Transaksi Baru
    let itemSummary = activeCart.map(c => c.name);
    sysDatabase.transactions.push({
        orderNumber: orderNum,
        id: transactionId,
        timestamp: timestamp,
        customer: customerName,
        items: itemSummary,
        itemCount: activeCart.length,
        subtotal: subtotal,
        diskon: diskonRaw,
        voucher: voucherRaw,
        total: grandTotal,
        payment: payMethod,
        status: 'Sukses'
    });

    saveToStorage();

    // Buat Desain Nota Thermal 58mm [cite: 416]
    let htmlReceipt = `
        <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:5px;">
            <strong style="font-size:13px;">PAKCHILL JUICE & SALAD</strong><br>
            Ujung Sialit, Medan, Indonesia<br>
            Order #${orderNum} | ID: ${transactionId}
        </div>
        <div style="margin: 8px 0; font-size:10px;">
            Waktu: ${new Date().toLocaleString('id-ID')}<br>
            Kasir: ${activeRole || 'Staff'}<br>
            Pelanggan: ${customerName}
        </div>
        <div style="border-bottom:1px dashed #000; padding-bottom:5px; margin-bottom:5px;">
    `;
    activeCart.forEach(item => {
        htmlReceipt += `<div>${item.name} <span style="float:right;">Rp ${item.price.toLocaleString('id-ID')}</span></div>`;
    });
    htmlReceipt += `
        </div>
        <div style="font-size:11px;">
            Subtotal: <span style="float:right;">Rp ${subtotal.toLocaleString('id-ID')}</span><br>
            Total Bayar: <span style="float:right; font-weight:bold;">Rp ${grandTotal.toLocaleString('id-ID')}</span><br>
            Metode: <span style="float:right;">${payMethod}</span>
        </div>
        <div style="text-align:center; margin-top:12px; font-weight:bold;">Terima Kasih Atas Kunjungan Anda!</div>
    `;

    document.getElementById('thermal-receipt-output').innerHTML = htmlReceipt;

    if (type === 'Print') {
        window.print();
    } else {
        alert(`Transaksi Berhasil Disimpan Digital!\nNomor Order: #${orderNum}\nID: ${transactionId}`);
    }

    // Reset Form Belanja Kembali Bersih
    activeCart = [];
    activeMemberObj = null;
    document.getElementById('kasir-search-member').value = '';
    document.getElementById('kasir-member-status-box').innerHTML = '';
    document.getElementById('kasir-input-diskon').value = '0';
    document.getElementById('kasir-input-voucher').value = '0';
    document.getElementById('kasir-cash-input-uang').value = '';
    document.getElementById('cash-return-info').innerText = 'Kembalian: Rp 0';
    
    document.getElementById('txt-live-order-number').innerText = `Order #: ${sysDatabase.currentOrderSeq}`;
    renderCartUI();
    calculateLiveClosingDashboard();
    renderHistoryTable();
    renderMemberTable();
    if(activeRole === 'owner') renderOwnerDashboardMetrics();
}

// ==========================================================================
// 6. DASHBOARD KASIR & OWNER CONTROLLER 
// ==========================================================================
function calculateLiveClosingDashboard() {
    let today = new Date().toDateString();
    let dailyTrx = sysDatabase.transactions.filter(t => new Date(t.timestamp).toDateString() === today && t.status === 'Sukses');
    
    let totalOmzet = dailyTrx.reduce((sum, t) => sum + t.total, 0);
    let totalQty = dailyTrx.reduce((sum, t) => sum + t.itemCount, 0);

    document.getElementById('txt-closing-total-omzet').innerText = 'Rp ' + totalOmzet.toLocaleString('id-ID');
    document.getElementById('txt-closing-total-qty').innerText = totalQty + ' Item';

    // Rincian Menu Terjual Hari Ini
    let counts = {};
    dailyTrx.forEach(t => {
        t.items.forEach(it => { counts[it] = (counts[it] || 0) + 1; });
    });

    const listTarget = document.getElementById('closing-menu-list-render');
    listTarget.innerHTML = '';
    for (let menuName in counts) {
        listTarget.innerHTML += `
            <div style="display:flex; justify-content:space-between; background:#f9f9f9; padding:4px 8px; border-radius:6px;">
                <span>${menuName}</span>
                <span style="font-weight:bold;">${counts[menuName]} Terjual</span>
            </div>`;
    }
}

function renderOwnerDashboardMetrics() {
    let now = new Date();
    let transactions = sysDatabase.transactions.filter(t => t.status === 'Sukses');

    let omzetHari = transactions.filter(t => new Date(t.timestamp).toDateString() === now.toDateString()).reduce((a, b) => a + b.total, 0);
    let omzetMinggu = transactions.filter(t => (now - new Date(t.timestamp)) <= 7 * 24 * 60 * 60 * 1000).reduce((a, b) => a + b.total, 0);
    let omzetBulan = transactions.filter(t => new Date(t.timestamp).getMonth() === now.getMonth() && new Date(t.timestamp).getFullYear() === now.getFullYear()).reduce((a, b) => a + b.total, 0);
    let omzetTahun = transactions.filter(t => new Date(t.timestamp).getFullYear() === now.getFullYear()).reduce((a, b) => a + b.total, 0);

    document.getElementById('own-rekap-hari').innerText = 'Rp ' + omzetHari.toLocaleString('id-ID');
    document.getElementById('own-rekap-minggu').innerText = 'Rp ' + omzetMinggu.toLocaleString('id-ID');
    document.getElementById('own-rekap-bulan').innerText = 'Rp ' + omzetBulan.toLocaleString('id-ID');
    document.getElementById('own-rekap-tahun').innerText = 'Rp ' + omzetTahun.toLocaleString('id-ID');

    // Render Visualisasi Tren Grafik Bulanan (Jan - Des) [cite: 571]
    let monthlyData = Array(12).fill(0);
    transactions.forEach(t => {
        let d = new Date(t.timestamp);
        if(d.getFullYear() === now.getFullYear()) {
            monthlyData[d.getMonth()] += t.total;
        }
    });

    const ctx = document.getElementById('canvasTrenOwner');
    if (ctx) {
        if(chartInstanceGlobal) chartInstanceGlobal.destroy();
        chartInstanceGlobal = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agst','Sept','Okt','Nov','Des'],
                datasets: [{
                    label: 'Omzet Penjualan Resmi (Rp)',
                    data: monthlyData,
                    borderColor: '#2d5a27',
                    backgroundColor: 'rgba(45, 90, 39, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// ==========================================================================
// 7. MANAJEMEN DATA & OTORITAS VOID (PEMBATALAN)
// ==========================================================================
function renderMemberTable() {
    const tbody = document.getElementById('own-render-member-rows');
    if(!tbody) return;
    tbody.innerHTML = '';

    sysDatabase.members.forEach((m, idx) => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${m.name}</strong></td>
                <td>${m.wa}</td>
                <td><mark style="background:#e4f0e2; padding:3px 8px; border-radius:6px; font-weight:bold; color:var(--pakchill-green-dark);">${m.poin} Poin</mark></td>
                <td style="text-align:center;">
                    <button onclick="deleteMemberFromOwner(${idx})" style="background:#ff3b30; color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:11px;">Hapus</button>
                </td>
            </tr>`;
    });
}

function deleteMemberFromOwner(idx) {
    if(confirm('Hapus member resmi ini?')) {
        sysDatabase.members.splice(idx, 1);
        saveToStorage();
        renderMemberTable();
    }
}

function renderHistoryTable() {
    const tbody = document.getElementById('own-render-history-rows');
    if(!tbody) return;
    tbody.innerHTML = '';

    let filterMonth = document.getElementById('own-filter-month-select').value;

    sysDatabase.transactions.forEach(t => {
        let tDate = new Date(t.timestamp);
        if(filterMonth !== 'all' && tDate.getMonth().toString() !== filterMonth) return;

        let actionButton = t.status === 'Sukses' 
            ? `<button onclick="executeVoidTransaction('${t.id}')" style="background:#ff9500; color:white; padding:4px 8px; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:11px;">VOID</button>`
            : `<span style="color:#999; font-style:italic;">Sudah Dibatalkan</span>`;

        let styleRow = t.status === 'VOID' ? 'style="background:#fff2f1; color:#999;"' : '';

        tbody.innerHTML += `
            <tr ${styleRow}>
                <td style="font-weight:bold; color:#ff9500;">#${t.orderNumber || '-'}</td>
                <td>${t.id}</td>
                <td>${tDate.toLocaleString('id-ID')}</td>
                <td>${t.customer}</td>
                <td style="font-weight:bold;">Rp ${t.total.toLocaleString('id-ID')}</td>
                <td><mark style="background:#f0f0f0; padding:2px 6px; border-radius:4px;">${t.payment}</mark></td>
                <td style="color:${t.status === 'Sukses' ? '#34c759' : '#ff3b30'}; font-weight:bold;">${t.status}</td>
                <td style="text-align:center;">${actionButton}</td>
            </tr>`;
    });
}

function executeVoidTransaction(id) {
    if(!confirm(`Apakah Anda yakin ingin melakukan VOID (Pembatalan) pada transaksi ${id}?`)) return; [cite: 124]
    
    let idx = sysDatabase.transactions.findIndex(t => t.id === id); [cite: 124]
    if(idx !== -1) {
        let trxObj = sysDatabase.transactions[idx]; [cite: 124]
        // Kembalikan/Kurangi Poin Member jika transaksi di-void 
        let memberMatch = sysDatabase.members.findIndex(m => m.name === trxObj.customer); [cite: 124]
        if(memberMatch !== -1) { [cite: 124]
            sysDatabase.members[memberMatch].poin -= trxObj.itemCount; [cite: 124]
            if(sysDatabase.members[memberMatch].poin < 0) sysDatabase.members[memberMatch].poin = 0; [cite: 124]
        }
        sysDatabase.transactions[idx].total = 0; // Set nominal pendapatan ke 0 rupiah 
        sysDatabase.transactions[idx].status = 'VOID';
        
        saveToStorage();
        renderHistoryTable();
        renderMemberTable();
        calculateLiveClosingDashboard();
        if(activeRole === 'owner') renderOwnerDashboardMetrics();
        alert('Otoritas VOID Sukses! Nilai transaksi disetel menjadi nol.');
    }
}

// ==========================================================================
// 8. DYNAMIC ADDITIONS DARI WORKSPACE OWNER
// ==========================================================================
function saveNewMenuFromOwner() {
    const name = document.getElementById('own-add-menu-name').value.trim().toUpperCase();
    const price = parseInt(document.getElementById('own-add-menu-price').value);

    if(!name || !price) { alert('Masukkan Nama Menu & Harga!'); return; }
    
    sysDatabase.menu.push({ id: 'm-' + Date.now(), name, price });
    saveToStorage();
    renderKatalogKasir();
    
    document.getElementById('own-add-menu-name').value = '';
    document.getElementById('own-add-menu-price').value = '';
    alert('Menu baru sukses ditambahkan ke katalog!');
}

function saveNewBundleFromOwner() {
    const name = document.getElementById('own-add-bundle-name').value.trim();
    const price = parseInt(document.getElementById('own-add-bundle-price').value);

    if(!name || !price) { alert('Masukkan Nama & Harga Paket!'); return; }

    sysDatabase.bundles.push({ id: 'b-' + Date.now(), name, price });
    saveToStorage();
    renderKatalogKasir();

    document.getElementById('own-add-bundle-name').value = '';
    document.getElementById('own-add-bundle-price').value = '';
    alert('Paket bundling hemat berhasil diaktifkan!');
}

function saveNewVoucherFromOwner() {
    const code = document.getElementById('own-vch-code').value.trim().toUpperCase();
    const nominal = parseInt(document.getElementById('own-vch-nominal').value);
    const type = document.getElementById('own-vch-type').value;

    if(!code || !nominal) { alert('Lengkapi data kupon diskon!'); return; }

    sysDatabase.vouchers.push({ code, nominal, type });
    saveToStorage();

    document.getElementById('own-vch-code').value = '';
    document.getElementById('own-vch-nominal').value = '';
    alert('Kode potongan voucher/diskon berhasil diregistrasikan!');
}

function saveNewRekeningFromOwner() {
    const bank = document.getElementById('own-rek-bankname').value;
    const nomor = document.getElementById('own-rek-number').value.trim();

    if(!nomor) { alert('Masukkan nomor rekening / akun!'); return; }

    sysDatabase.rekening.push({ bank, nomor: nomor + ' a/n PAKCHILL ENTERPRISE' });
    saveToStorage();
    handlePaymentDropdownBranching();

    document.getElementById('own-rek-number').value = '';
    alert('Rekening penampung baru berhasil dikonfigurasi!');
}

// ==========================================================================
// 9. EKSPOR LAPORAN (EXCEL & PDF INTEGRATION)
// ==========================================================================
function exportKasirReportExcel() {
    let data = sysDatabase.transactions.map(t => ({
        "No Order": t.orderNumber, "ID Nota": t.id, "Waktu": t.timestamp, "Pelanggan": t.customer, "Total Bersih": t.total, "Metode": t.payment, "Status": t.status
    }));
    let ws = XLSX.utils.json_to_sheet(data);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kasir_Closing");
    XLSX.writeFile(wb, `Report_Kasir_${new Date().toLocaleDateString()}.xlsx`);
}

function exportKasirReportPDF() {
    const element = document.getElementById('closing-report-pdf-area');
    html2pdf().from(element).save(`Report_Kasir_${Date.now()}.pdf`);
}

function exportOwnerReportExcel() {
    let ws = XLSX.utils.table_to_sheet(document.getElementById('table-owner-transactions-log'));
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Log_Transaksi");
    XLSX.writeFile(wb, "Owner_Master_Report.xlsx");
}

function exportOwnerReportPDF() {
    const element = document.getElementById('owner-report-pdf-area');
    html2pdf().from(element).save(`Owner_Master_Report_${Date.now()}.pdf`);
}
