// Fragmenty prawdziwych odpowiedzi API ecoharmonogram.pl dla adresu Pruszków, ul. Rolnicza 18 (pobrane 2026-10-04)
module.exports = {
	getTowns: { towns: [
		{ id: "793", communityId: "53", name: "Pruszkowo", district: "Wielichowo", province: "Wielkopolskie" },
		{ id: "3964", communityId: "180", name: "Pruszków", district: "Pruszków", province: "Mazowieckie" },
		{ id: "5610", communityId: "260", name: "Pruszków", district: "Bliżanów", province: "Wielkopolskie" }
	] },
	getSchedulePeriods: { schedulePeriods: [{ id: "10536", startDate: "2026-01-01", endDate: "2026-12-31", changeDate: "2026-02-10 12:16:20" }] },
	getStreets: { streets: [{ id: "27577836", name: "Rolnicza", sides: "żbików", townName: "Pruszków" }], groups: { items: [], groupId: "" } },
	getSchedules: {
		schedules: [
			{ month: "10", days: "15", year: "2026", scheduleDescriptionId: "103290" },
			{ month: "10", days: "8;22", year: "2026", scheduleDescriptionId: "103284" },
			{ month: "10", days: "1;8;15;22;29", year: "2026", scheduleDescriptionId: "103285" },
			{ month: "10", days: "7;21", year: "2026", scheduleDescriptionId: "103286" },
			{ month: "10", days: "7;21", year: "2026", scheduleDescriptionId: "103287" },
			{ month: "10", days: "7;21", year: "2026", scheduleDescriptionId: "103288" }
		],
		scheduleDescription: [
			{ id: "103290", name: "TERMIN PŁATNOŚCI", color: "#E30000", doNotShowDates: "0" },
			{ id: "103284", name: "ODPADY ZMIESZANE", color: "#413939", doNotShowDates: "0" },
			{ id: "103285", name: "BIO", color: "#C68C52", doNotShowDates: "0" },
			{ id: "103286", name: "METALE I TWORZYWA SZTUCZNE", color: "#FFC40D", doNotShowDates: "0" },
			{ id: "103287", name: "SZKŁO", color: "#42B500", doNotShowDates: "0" },
			{ id: "103288", name: "PAPIER", color: "#3D8CBA", doNotShowDates: "0" }
		]
	}
};
