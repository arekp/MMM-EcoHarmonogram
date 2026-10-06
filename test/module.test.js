const { test, describe, before, after, mock } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const { parseSchedules } = require("../lib/ecoharmonogram");
const fixtures = require("./fixtures");
const pl = require("../translations/pl.json");

let definition;

/** Tworzy instancję modułu tak, jak robi to MagicMirror (uproszczone). */
function createModule (config = {}) {
	const instance = Object.create(definition);
	instance.config = { ...definition.defaults, ...config };
	instance.translate = (key) => pl[key];
	instance.identifier = "module_0";
	instance.data = { header: "Wywóz śmieci" };
	instance.sent = [];
	instance.domReady = true;
	instance.sendNotification = (notification, payload) => instance.sent.push({ notification, payload });
	instance.collections = parseSchedules(fixtures.getSchedules).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pl"));
	return instance;
}

const rows = (dom) => [...dom.querySelectorAll("tr")].map((tr) => ({
	day: tr.querySelector(".day").textContent,
	types: [...tr.querySelectorAll(".type")].map((t) => t.textContent)
}));

describe("MMM-EcoHarmonogram getDom", () => {
	before(() => {
		mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-06T10:00:00") });
		global.document = new JSDOM("<body></body>").window.document;
		global.moment = require("moment");
		require("moment/locale/pl");
		global.Module = { register: (name, def) => { definition = def; } };
		require("../MMM-EcoHarmonogram.js");
	});

	after(() => {
		mock.timers.reset();
		delete global.document;
		delete global.moment;
		delete global.Module;
	});

	test("grupuje wywozy po dniach i pokazuje Jutro", () => {
		const r = rows(createModule({ maxDays: 5 }).getDom());
		assert.deepStrictEqual(r[0], { day: "Jutro", types: ["Metale i tworzywa sztuczne", "Papier", "Szkło"] });
		assert.strictEqual(r[1].day, "Cz 8 paź");
		assert.deepStrictEqual(r[1].types, ["Bio", "Odpady zmieszane"]);
		assert.strictEqual(r.length, 5);
	});

	test("domyślnie pokazuje tylko najbliższy dzień z wywozem", () => {
		const r = rows(createModule().getDom());
		assert.strictEqual(r.length, 1);
		assert.deepStrictEqual(r[0], { day: "Jutro", types: ["Metale i tworzywa sztuczne", "Papier", "Szkło"] });
	});

	test("maxDays ustawia liczbę dni, nieprawidłowa wartość działa jak 1", () => {
		assert.strictEqual(rows(createModule({ maxDays: 3 }).getDom()).length, 3);
		assert.strictEqual(rows(createModule({ maxDays: 0 }).getDom()).length, 1);
		assert.strictEqual(rows(createModule({ maxDays: "abc" }).getDom()).length, 1);
	});

	test("domyślnie pomija termin płatności", () => {
		const all = rows(createModule({ maxDays: 10 }).getDom()).flatMap((r) => r.types);
		assert.ok(!all.some((t) => /płatności/i.test(t)));
		const withPayment = rows(createModule({ exclude: [], maxDays: 10 }).getDom()).flatMap((r) => r.types);
		assert.ok(withPayment.includes("Termin płatności"));
	});

	test("dobiera ikony i rozjaśnia zbyt ciemne kolory", () => {
		const dom = createModule({ maxDays: 2 }).getDom();
		const icons = [...dom.querySelectorAll("tr")[1].querySelectorAll("i")];
		assert.ok(icons[0].className.includes("fa-leaf"));
		assert.ok(icons[1].className.includes("fa-trash-can"));
		assert.strictEqual(icons[1].style.color, "rgb(154, 154, 154)", "#413939 zamieniony na szary");
	});

	test("showIcons: false pokazuje kolorowe kropki", () => {
		const dom = createModule({ showIcons: false }).getDom();
		assert.strictEqual(dom.querySelectorAll("i").length, 0);
		assert.ok(dom.querySelectorAll(".dot").length > 0);
	});

	test("pokazuje błąd konfiguracji, gdy nie ma danych", () => {
		const m = createModule();
		m.collections = null;
		m.error = "Nie znaleziono ulicy";
		assert.match(m.getDom().textContent, /Błąd pobierania harmonogramu: Nie znaleziono ulicy/);
	});

	test("showList: false nie pokazuje listy ani nagłówka", () => {
		const m = createModule({ showList: false });
		assert.strictEqual(m.getDom().children.length, 0);
		assert.strictEqual(m.getDom().textContent, "");
		assert.strictEqual(m.getHeader(), "");
		assert.strictEqual(createModule().getHeader(), "Wywóz śmieci");
	});
});

describe("alert dzień przed wywozem", () => {
	const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

	before(() => {
		mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-06T17:00:00") });
		global.document = new JSDOM("<body></body>").window.document;
		global.moment = require("moment");
		global.Module = { register: (name, def) => { definition = def; } };
		delete require.cache[require.resolve("../MMM-EcoHarmonogram.js")];
		require("../MMM-EcoHarmonogram.js");
	});

	after(() => {
		mock.timers.reset();
		delete global.document;
		delete global.moment;
		delete global.Module;
	});

	test("pokazuje SHOW_ALERT z rodzajami odpadów odbieranymi jutro", () => {
		at("2026-10-06T17:00:00");
		const m = createModule();
		m.checkAlert();
		assert.strictEqual(m.sent.length, 1);
		assert.strictEqual(m.sent[0].notification, "SHOW_ALERT");
		assert.deepStrictEqual(m.sent[0].payload, {
			type: "alert",
			title: "Jutro wywóz śmieci",
			message: "Metale i tworzywa sztuczne, Papier, Szkło",
			imageFA: "recycle",
			timer: 30000
		});
	});

	test("domyślnie pokazuje alert od 12:00 dnia przed wywozem", () => {
		at("2026-10-06T15:29:00");
		const m = createModule();
		m.checkAlert();
		assert.strictEqual(m.sent.length, 1);
	});

	test("nie wysyła alertu przed DOM_OBJECTS_CREATED i nie blokuje go na godzinę", () => {
		at("2026-10-06T17:00:00");
		const m = createModule();
		m.domReady = false;
		m.checkAlert(); // dane z node_helpera przyszły, zanim lustro było gotowe
		assert.strictEqual(m.sent.length, 0);
		m.notificationReceived("DOM_OBJECTS_CREATED");
		assert.strictEqual(m.sent.length, 1);
		assert.strictEqual(m.sent[0].notification, "SHOW_ALERT");
	});

	test("nie pokazuje alertu przed alertFromHour ani gdy jutro nie ma wywozu", () => {
		at("2026-10-06T11:59:00");
		const early = createModule();
		early.checkAlert();
		assert.strictEqual(early.sent.length, 0);

		at("2026-10-09T18:00:00"); // 10 października brak wywozu
		const none = createModule();
		none.checkAlert();
		assert.strictEqual(none.sent.length, 0);
	});

	test("ponawia alert co alertRepeatInterval, a przy 0 tylko raz", () => {
		at("2026-10-06T17:00:00");
		const m = createModule();
		m.checkAlert();
		at("2026-10-06T17:30:00");
		m.checkAlert();
		assert.strictEqual(m.sent.length, 1, "nie częściej niż co godzinę");
		at("2026-10-06T18:00:00");
		m.checkAlert();
		assert.strictEqual(m.sent.length, 2);

		at("2026-10-06T17:00:00");
		const once = createModule({ alertRepeatInterval: 0 });
		once.checkAlert();
		at("2026-10-06T21:00:00");
		once.checkAlert();
		assert.strictEqual(once.sent.length, 1);
	});

	test("showAlert: false wyłącza alert, alertType zmienia rodzaj", () => {
		at("2026-10-06T17:00:00");
		const off = createModule({ showAlert: false });
		off.checkAlert();
		assert.strictEqual(off.sent.length, 0);

		const note = createModule({ alertType: "notification" });
		note.checkAlert();
		assert.strictEqual(note.sent[0].payload.type, "notification");
	});

	test("alert pomija pozycje z exclude (termin płatności 15.10)", () => {
		at("2026-10-14T17:00:00");
		const m = createModule();
		m.checkAlert();
		assert.deepStrictEqual(m.sent.map((s) => s.payload.message), ["Bio"]);
	});
});
