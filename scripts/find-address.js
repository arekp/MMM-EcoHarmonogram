#!/usr/bin/env node
/**
 * Pomocnik konfiguracji: sprawdza adres w EcoHarmonogramie, podpowiada brakujące
 * opcje i drukuje gotowy fragment do config.js.
 *
 *   npm run find -- --town "Pruszków" --district "Pruszków" --street "Rolnicza" --number 18
 *
 * Opcje: --town --district --street --number --sides --region --community --app
 *        --language --g1 ... --g5
 */
const { parseArgs } = require("node:util");
const { EcoHarmonogram, ConfigError } = require("../lib/ecoharmonogram");

const stringOpts = ["town", "district", "street", "number", "sides", "region", "community", "app", "language", "g1", "g2", "g3", "g4", "g5"];
const { values } = parseArgs({
	options: Object.fromEntries([...stringOpts.map((k) => [k, { type: "string" }]), ["help", { type: "boolean", short: "h" }]])
});

if (values.help || !values.town) {
	console.log("Użycie: npm run find -- --town <miejscowość> [--district <gmina>] [--street <ulica>] --number <nr>\n");
	console.log("Dodatkowe: --sides, --region, --g1..--g5, --community, --app, --language");
	process.exit(values.help ? 0 : 1);
}

async function main () {
	const client = new EcoHarmonogram({ app: values.app, language: values.language });

	if (!values.number) {
		const towns = await client.getTowns({ town: values.town, community: values.community });
		console.log("Znalezione miejscowości (town / district):");
		for (const t of towns) console.log(`  ${t.name} / ${t.district} (${t.province})`);
		console.log("\nPodaj jeszcze --street i --number.");
		return;
	}

	const groups = Object.fromEntries(["g1", "g2", "g3", "g4", "g5"].filter((g) => values[g]).map((g) => [g, values[g]]));
	const address = { ...values, groups };
	const events = await client.getCollections(address);
	const today = new Date().toISOString().slice(0, 10);

	console.log("Adres znaleziony. Najbliższe wywozy:");
	for (const e of events.filter((e) => e.date >= today).slice(0, 10)) console.log(`  ${e.date}  ${e.name}`);

	const config = Object.fromEntries(
		["town", "district", "street", "number", "sides", "region", "community", "app"]
			.filter((k) => values[k])
			.map((k) => [k, values[k]])
	);
	if (Object.keys(groups).length) config.groups = groups;
	console.log("\nFragment do config/config.js:\n");
	console.log(JSON.stringify({ module: "MMM-EcoHarmonogram", position: "top_left", header: "Wywóz śmieci", config }, null, "\t")
		.replace(/"(\w+)":/g, "$1:"));
}

main().catch((err) => {
	if (err instanceof ConfigError) {
		console.error(`Brakuje lub błędna opcja "${err.option}": ${err.message}`);
		const flag = err.option.replace(/^groups\./, "");
		if (err.suggestions.length) console.error(`\nDodaj np.: --${flag} "${err.suggestions[0]}"`);
	} else {
		console.error(err.message);
	}
	process.exit(1);
});
