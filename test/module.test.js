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
});
