/******************************************************************************
 * Chaotix Save Editor                                                        *
 *                                                                            *
 * Copyright (C) 2020 J.C. Fields (jcfields@jcfields.dev).                    *
 *                                                                            *
 * Permission is hereby granted, free of charge, to any person obtaining a    *
 * copy of this software and associated documentation files (the "Software"), *
 * to deal in the Software without restriction, including without limitation  *
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,   *
 * and/or sell copies of the Software, and to permit persons to whom the      *
 * Software is furnished to do so, subject to the following conditions:       *
 *                                                                            *
 * The above copyright notice and this permission notice shall be included in *
 * all copies or substantial portions of the Software.                        *
 *                                                                            *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR *
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,   *
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL    *
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER *
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING    *
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER        *
 * DEALINGS IN THE SOFTWARE.                                                  *
 ******************************************************************************/

"use strict";

/*
 * constants
 */

// total size of save file
const CONSOLE_SIZE = 512;

// file names and locations
const CONSOLE_SAVE_NAME = "chaotix.srm";
const MIME_TYPE = "application/x-chaotix-save-file";
const STORAGE_NAME = "chaotix";
const HEX_VIEW_WIDTH = 16;

// save format
const SLOTS = 3;
const SLOT_START  = 0x004;
const SLOT_OFFSET = 0x020;
const SLOT_LENGTH = 12;
const SECTIONS = 2;
const SECTION_START  = 0x000;
const SECTION_LENGTH = 0x100;
const CHECKSUM_OFFSET = 0x002;
// scenario quest
const ATTRACTIONS_OFFSET = 0x000;
const CHAOS_RINGS_OFFSET = 0x003;
const SCORE_OFFSET       = 0x004;
const PLAY_TIME_OFFSET   = 0x008;

// game mechanics
const ZONES = 5;
const ACTS = 5;
const CHAOS_RINGS = 6;
const CHANGE_NEXT = 0o4;

// save format
const CONSOLE = 0;
const BYTE = false, WORD = true;
const LITTLE_ENDIAN = false, BIG_ENDIAN = true;

/*
 * initialization
 */

window.addEventListener("load", function() {
	const editor = new Editor();
	const store = new Storage(STORAGE_NAME);

	try {
		const {save, selected} = store.load();
		const saveCollection = new SaveCollection();

		if (save != undefined) {
			saveCollection.loadFromStorage(save);
		}

		editor.open(saveCollection, selected);
	} catch (err) {
		store.reset();
		displayError(err);
	}

	window.addEventListener("beforeunload", function() {
		store.save(editor.saveToStorage());
	});
	window.addEventListener("keyup", function(event) {
		const keyCode = event.keyCode;

		if (keyCode == 27) { // Esc
			for (const element of $$(".overlay")) {
				element.classList.remove("open");
			}
		}
		if (keyCode == 192) { // grave
			editor.toggleHexView();
		}
	});

	document.addEventListener("click", function(event) {
		const element = event.target;

		if (element.matches("#download")) {
			try {
				const {filename, blob} = editor.saveToFile();

				const a = $("#link");
				a.download = filename;
				a.href = window.URL.createObjectURL(blob);
				a.click();
				window.URL.revokeObjectURL(blob);
			} catch (err) {
				displayError(err);
			}
		}

		if (element.closest("section")) {
			const current = element.closest("section");

			for (const section of $$("section")) {
				section.classList.toggle("active", section == current);
			}
		}

		if (element.matches("#new")) {
			editor.saveScenario();
		}

		if (element.matches("#reset")) {
			editor.restoreDefaults();
		}

		if (element.closest(".slot")) {
			editor.setSlot(Number(element.closest(".slot").value));
		}

		if (element.matches(".chaosRing")) {
			const value = Number(element.value);
			const input = $("#specialStage");

			// setting to all rings does not remove additional wireframe
			// special stages that may have been completed
			if (value != CHAOS_RINGS || input.value <= CHAOS_RINGS) {
				input.value = Number(element.value) + 1;
			}

			editor.saveScenario();
		}

		if (element.matches("#advanced, .dataSize, .byteOrder, .fillerByte")) {
			editor.saveOptions();
		}

		if (element.closest(".close")) {
			element.closest(".overlay").classList.remove("open");
		}
	});
	document.addEventListener("input", function(event) {
		const element = event.target;

		if (element.matches(".editor input, .editor select")) {
			editor.saveScenario();
		}
	});

	$("#file").addEventListener("change", function(event) {
		const file = event.target.files[0];

		if (file != null) {
			const reader = new FileReader();
			reader.addEventListener("load", function(event) {
				try {
					const saveCollection = new SaveCollection();
					saveCollection.loadFromFile(event.target.result);
					editor.open(saveCollection);
				} catch (err) {
					displayError(err);
				}
			});
			reader.readAsArrayBuffer(file);
		}
	});

	function displayError(message) {
		$("#error").classList.add("open");
		$("#error p").textContent = message;
	}
});

function $(selector) {
	return document.querySelector(selector);
}

function $$(selector) {
	return Array.from(document.querySelectorAll(selector));
}

/*
 * Editor prototype
 */

function Editor() {
	this.saveCollection = null;
	this.selected = 0;
	this.showAdvanced = false;
}

Editor.prototype.open = function(saveCollection, selected) {
	this.saveCollection = saveCollection;

	if (selected != undefined) {
		this.selected = selected;
	}

	this.setSlot(this.selected);
	this.loadOptions();
};

Editor.prototype.restoreDefaults = function() {
	const saveCollection = new SaveCollection();
	saveCollection.platform = this.saveCollection.platform;

	this.open(saveCollection);
};

Editor.prototype.saveToFile = function() {
	if (this.saveCollection == null) {
		return;
	}

	const file = this.saveCollection.saveToFile();

	return {
		filename: CONSOLE_SAVE_NAME,
		blob:     new Blob([file], {type: MIME_TYPE})
	};
};

Editor.prototype.saveToStorage = function() {
	if (this.saveCollection != null) {
		return {
			save:     this.saveCollection.saveToStorage(),
			selected: this.selected
		};
	}
};

Editor.prototype.setSlot = function(selected=0) {
	this.selected = selected;

	for (const element of $$(".slot")) {
		const state = Number(element.value) == selected;
		element.classList.toggle("active", state);
	}

	this.loadScenario();
};

Editor.prototype.loadOptions = function() {
	if (this.saveCollection == null) {
		return;
	}

	const {dataSize, byteOrder, fillerByte} = this.saveCollection.options;

	for (const element of $$(".dataSize")) {
		element.checked = Number(dataSize) == Number(element.value);
	}

	for (const element of $$(".byteOrder")) {
		element.checked = Number(byteOrder) == Number(element.value);
		element.disabled = dataSize != WORD;
	}

	for (const element of $$(".fillerByte")) {
		element.checked = Number(fillerByte) == Number(element.value);
		element.disabled = dataSize != WORD;
	}

	for (const element of $$(".advanced")) {
		element.hidden = !this.showAdvanced;
	}
};

Editor.prototype.loadScenario = function() {
	const slot = this.saveCollection.slots[this.selected];

	if (slot == null) {
		return;
	}

	const data = slot.scenario;

	for (const element of $$(".editor button, .editor input, .editor select")) {
		element.disabled = data.isNew;
	}

	$("#new").checked = data.isNew;
	$("#score").value = data.score;

	const state = data.chaosRings >= CHAOS_RINGS;
	$("#specialStage").value = data.chaosRings + 1;
	$("#specialStage").classList.toggle("wireframe", state);

	$("#hr").value   = data.playTime.hr.toString();
	$("#min").value  = data.playTime.min.toString();
	$("#sec").value  = data.playTime.sec.toString().padStart(2, "0");
	$("#tick").value = data.playTime.tick.toString().padStart(2, "0");

	const MONITORS = [
		"mighty", "knuckles",
		"vector", "espio",
		"charmy"
	];
	const CHARACTERS = [
		"Mighty the Armadillo", "Knuckles the Echidna",
		"Vector the Crocodile", "Espio the Chameleon",
		"Charmy Bee"
	];

	$("#character").value = data.character;

	const src = "images/monitor-" + MONITORS[data.character] + ".png";
	loadImage("#monitor", src, CHARACTERS[data.character]);

	const TIMES_OF_DAY = ["Morning", "Day", "Sunset", "Night"];

	$("#timeOfDay").value = data.timeOfDay;
	$("#showTimeOfDay").textContent = TIMES_OF_DAY[data.timeOfDay % 4];
	$("#changeNext").checked = data.changeNext;

	for (const [id, level] of Object.entries(data.stages)) {
		const clear = level > ACTS;
		const act = $(`#${id} .act`);
		act.classList.toggle("clear", clear);
		act.textContent = clear ? "Clear" : level;

		$(`#${id} img`).classList.toggle("clear", clear);
		$(`#${id} input`).value = level;
	}

	for (const element of $$(".chaosRing")) {
		const collected = Number(element.value) > data.chaosRings;
		element.classList.toggle("collected", !collected);
		element.classList.toggle("empty",      collected);
	}

	function loadImage(selector, src, title) {
		const img = new Image();
		img.src = src;
		img.addEventListener("load", function() {
			$(selector).src = this.src;
			$(selector).alt = title;
			$(selector).title = title;
		});
	}
};

Editor.prototype.saveOptions = function() {
	if (this.saveCollection == null) {
		return;
	}

	this.showAdvanced = $("#advanced").checked;

	this.saveCollection.options = {
		dataSize:   $("#word").checked,
		fillerByte: $("#b00").checked ? 0x00 : 0xff,
		byteOrder:  $("#big").checked
	};
	this.saveCollection.platform = CONSOLE;
	this.loadOptions();
};

Editor.prototype.saveScenario = function() {
	const slot = this.saveCollection.slots[this.selected];

	if (slot == null) {
		return;
	}

	const stages = {
		botanicBase:   fillNumber("#botanicBase input"),
		speedSlider:   fillNumber("#speedSlider input"),
		technoTower:   fillNumber("#technoTower input"),
		amazingArena:  fillNumber("#amazingArena input"),
		marinaMadness: fillNumber("#marinaMadness input")
	};

	const playTime = {
		hr:   fillNumber("#hr"),
		min:  fillNumber("#min"),
		sec:  fillNumber("#sec"),
		tick: fillNumber("#tick")
	};

	slot.scenario = {
		isNew:      $("#new").checked,
		stages:     stages,
		character:  fillNumber("#character"),
		timeOfDay:  fillNumber("#timeOfDay"),
		changeNext: $("#changeNext").checked,
		playTime:   playTime,
		score:      fillNumber("#score"),
		chaosRings: fillNumber("#specialStage") - 1
	};
	this.loadScenario();

	function fillNumber(selector) {
		const element = $(selector);

		let value = Number(element.value);
		value = Math.min(element.max, value);
		value = Math.max(element.min, value);

		return value;
	}
};

Editor.prototype.toggleHexView = function() {
	if (this.saveCollection == null) {
		return;
	}

	const state = !$("#hexview").classList.contains("open");

	if (state) {
		const {blob} = this.saveToFile();

		const reader = new FileReader();
		reader.addEventListener("load", function(event) {
			const file = new Uint8Array(event.target.result);

			const pad = Math.ceil(Math.log(file.length + 1) / Math.log(16));
			let col = "", hex = "", asc = "";

			for (const [i, character] of file.entries()) {
				hex += character.toString(16).padStart(2, "0") + " ";

				// range of printable characters in ASCII
				if (character >= 0x20 && character <= 0x7e) {
					asc += String.fromCharCode(character) + " ";
				} else {
					asc += "  ";
				}

				if (i % HEX_VIEW_WIDTH == 0) {
					col += i.toString(16).padStart(pad, "0") + "\n";
				} else if ((i + 1) % HEX_VIEW_WIDTH == 0) {
					hex += "\n";
					asc += "\n";
				}
			}

			$("#col").textContent = col;
			$("#hex").textContent = hex;
			$("#asc").textContent = asc;
		});
		reader.readAsArrayBuffer(blob);
	} else {
		$("#col").textContent = "";
		$("#hex").textContent = "";
		$("#asc").textContent = "";
	}

	$("#hexview").classList.toggle("open", state);
};

/*
 * SaveCollection prototype
 */

function SaveCollection() {
	this.slots = Array(SLOTS).fill().map(function(undefined, i) {
		return new SaveSlot(i);
	});
	this.options = {
		dataSize:   WORD,
		byteOrder:  BIG_ENDIAN,
		fillerByte: 0x00
	};
	this.platform = CONSOLE;
}

SaveCollection.prototype.loadFromFile = function(buffer) {
	let file = new Uint8Array(buffer);

	let {dataSize, byteOrder, fillerByte} = this.options;
	let platform = this.platform;

	// tries to determine file format by searching for constants
	// in unused section
	if (file[0x0ba] == 0x9e && file[0x0bb] == 0xfb) {
		platform  = CONSOLE;
		dataSize  = BYTE;
		byteOrder = BIG_ENDIAN;
	} else if (file[0x174] == 0x9e && file[0x176] == 0xfb) {
		platform  = CONSOLE;
		dataSize   = WORD;
		byteOrder  = LITTLE_ENDIAN;
		fillerByte = file[0xb1];

		file = file.filter(convertFromLittleEndian);
	} else if (file[0x175] == 0x9e && file[0x177] == 0xfb) {
		platform  = CONSOLE;
		dataSize   = WORD;
		byteOrder  = BIG_ENDIAN;
		fillerByte = file[0xb2];

		file = file.filter(convertFromBigEndian);
	} else {
		throw "Could not determine format of file.";
	}

	this.options = {dataSize, byteOrder, fillerByte};
	this.platform = platform;

	this.openFile(file);

	function convertFromLittleEndian(undefined, i) {
		return i % 2 == 0; // skips even bytes
	}

	function convertFromBigEndian(undefined, i) {
		return i % 2 != 0; // skips odd bytes
	}
};

SaveCollection.prototype.loadFromStorage = function(obj) {
	const {slots, options, platform} = obj;

	this.slots = slots.map(function(save, i) {
		const slot = new SaveSlot(i);
		slot.load(save);

		return slot;
	});

	this.options  = options;
	this.platform = platform || CONSOLE;
};

SaveCollection.prototype.openFile = function(file) {
	let section = [];

	const section1 = file.slice(
		SECTION_START,
		SECTION_START + SECTION_LENGTH
	);
	const section2 = file.slice(
		SECTION_START + SECTION_LENGTH,
		SECTION_START + SECTION_LENGTH * 2
	);

	// all data is duplicated in the save file for integrity;
	// uses first set if checksum passes,
	// otherwise uses second set if checksum passes,
	// otherwise returns empty array
	if (this.verifyChecksum(section1)) {
		section = section1;
	} else if (this.verifyChecksum(section2)) {
		section = section2;
	} else {
		throw "File contained no valid data.";
	}

	const slots = [];

	for (let i = 0; i < SLOTS; i++) {
		const slot = new SaveSlot(i);
		slot.openSlot(section.slice(
			SLOT_START + SLOT_OFFSET * i,
			SLOT_START + SLOT_OFFSET * i + SLOT_LENGTH
		));
		slots.push(slot);
	}

	this.slots = slots;
};

SaveCollection.prototype.saveFile = function() {
	const section = new Uint8Array(SECTION_LENGTH);

	// writes default data
	for (let i = 0; i < 24; i++) {
		const start = i * 6;

		section[start + 48] = 0x9e;
		section[start + 49] = 0xfb;
		section[start + 53] = 0x01;
	}

	// writes slots to section
	for (let i = 0; i < SLOTS; i++) {
		const start = SLOT_START + SLOT_OFFSET * i;
		const buffer = this.slots[i].saveSlot();

		if (!this.slots[i].isEmpty) {
			for (let j = 0; j < buffer.length; j++) {
				section[start + j] = buffer[j];
			}
		}
	}

	const checksum = this.calculateChecksum(section);

	// writes new checksum to beginning of section
	section[CHECKSUM_OFFSET]     = (checksum >> 8) & 0xff;
	section[CHECKSUM_OFFSET + 1] =  checksum       & 0xff;

	const file = new Uint8Array(CONSOLE_SIZE);

	// writes sections to file
	for (let i = 0; i < SECTIONS; i++) {
		const start = SECTION_START + SECTION_LENGTH * i;

		for (let j = 0; j < section.length; j++) {
			file[start + j] = section[j];
		}
	}

	return file;
};

SaveCollection.prototype.saveToFile = function() {
	const {dataSize, byteOrder, fillerByte} = this.options;
	let file = this.saveFile();

	if (dataSize == WORD) {
		if (byteOrder == LITTLE_ENDIAN) {
			file = convertToLittleEndian(file);
		} else {
			file = convertToBigEndian(file);
		}
	}

	return file;

	function convertToLittleEndian(oldFile) {
		// using Uint8Array because the byte order of numbers saved in
		// Uint16Array is architecture-dependent
		const newFile = new Uint8Array(CONSOLE_SIZE * 2);

		for (let i = 0, n = 0; i < newFile.length; i += 2, n++) {
			newFile[i]     = oldFile[n];
			newFile[i + 1] = fillerByte;
		}

		return newFile;
	}

	function convertToBigEndian(oldFile) {
		const newFile = new Uint8Array(CONSOLE_SIZE * 2);

		for (let i = 0, n = 0; i < newFile.length; i += 2, n++) {
			newFile[i]     = fillerByte;
			newFile[i + 1] = oldFile[n];
		}

		return newFile;
	}
};

SaveCollection.prototype.saveToStorage = function() {
	return {
		slots:    this.slots,
		options:  this.options,
		platform: this.platform
	};
};

SaveCollection.prototype.calculateChecksum = function(bytes) {
	const size = bytes.length - 4;
	let checksum = 0x4b52;

	for (let i = 0; i < size; i++) {
		const high = checksum & 0xff00;
		let low = (checksum & 0x00ff) + bytes[i + 4];

		const extend = Number(low > 0xff);

		if (extend) {
			low %= 0x100;
		}

		const counter = size + extend - i - 1;
		checksum = (high | low) + counter;
	}

	return checksum;
};

SaveCollection.prototype.verifyChecksum = function(bytes) {
	const original = (bytes[CHECKSUM_OFFSET] << 8) | bytes[CHECKSUM_OFFSET + 1];
	const checksum = this.calculateChecksum(bytes);

	return original == checksum;
};

/*
 * SaveSlot prototype
 */

function SaveSlot(slot=0) {
	this.isEmpty = true;

	const stages = {
		botanicBase:   1,
		speedSlider:   1,
		amazingArena:  1,
		technoTower:   1,
		marinaMadness: 1
	};
	const playTime = {
		hr:   0,
		min:  0,
		sec:  0,
		tick: 0
	};

	this.scenario = {
		isNew:      slot > 0,
		stages:     stages,
		character:  1,
		timeOfDay:  0,
		changeNext: false,
		playTime:   playTime,
		score:      0,
		chaosRings: 0
	};
}

SaveSlot.prototype.load = function(obj) {
	const {scenario} = obj;

	if (scenario != undefined) {
		this.scenario = scenario;
	}
};

SaveSlot.prototype.openSlot = function(file) {
	const attractions = readBytes(ATTRACTIONS_OFFSET, 3);
	const isNew = attractions <= 1;

	let stages = null, character = 0, timeOfDay = 0, changeNext = false;
	let score = 0, playTime = 0, chaosRings = 0;

	if (isNew) {
		stages = {
			botanicBase:   1,
			speedSlider:   1,
			amazingArena:  1,
			technoTower:   1,
			marinaMadness: 1
		};
		character = 0;
		timeOfDay = 0;
		changeNext = false;
	} else {
		stages = {
			botanicBase:   (attractions >> 21) & 0o7,
			speedSlider:   (attractions >> 18) & 0o7,
			amazingArena:  (attractions >> 15) & 0o7,
			technoTower:   (attractions >> 12) & 0o7,
			marinaMadness: (attractions >> 9)  & 0o7
		};
		character  = (attractions >> 6)  & 0o7;
		timeOfDay  = (attractions >> 3)  & 0o7;
		changeNext = (attractions        & 0o7) == CHANGE_NEXT;

		score = readBytes(SCORE_OFFSET, 4);
		playTime = readBytes(PLAY_TIME_OFFSET, 4);
		chaosRings = Math.min(file[CHAOS_RINGS_OFFSET], ZONES * (ACTS - 1));
	}

	this.scenario = {
		isNew,
		stages,
		character,
		timeOfDay,
		changeNext,
		playTime: formatTime(playTime),
		score,
		chaosRings
	};

	function formatTime(time) {
		const hr   = Math.floor(time / (60 * 60 * 64));
		const rem1 = time % (60 * 60 * 64);
		const min  = Math.floor(rem1 / (60 * 64));
		const rem2 = rem1 % (60 * 64);
		const sec  = Math.floor(rem2 / 64);
		const tick = rem2 % 64;

		return {hr, min, sec, tick};
	}

	function readBytes(pos, length) {
		let value = 0;

		for (let i = 0; i < length; i++) {
			const shift = 8 * (length - i - 1);
			value |= file[pos + i] << shift;
		}

		return value >>> 0; // treats as unsigned
	}
};

SaveSlot.prototype.saveSlot = function() {
	const file = new Uint8Array(SLOT_LENGTH);

	if (this.scenario.isNew) {
		writeBytes(ATTRACTIONS_OFFSET, 3, 0);
		writeBytes(CHAOS_RINGS_OFFSET, 1, 0);
		writeBytes(SCORE_OFFSET,       4, 0);
		writeBytes(PLAY_TIME_OFFSET,   4, 0);
	} else {
		const changeNext = this.scenario.changeNext ? CHANGE_NEXT : 0;
		const attractions = (this.scenario.stages.botanicBase   & 0o7) << 21
		                  | (this.scenario.stages.speedSlider   & 0o7) << 18
		                  | (this.scenario.stages.amazingArena  & 0o7) << 15
		                  | (this.scenario.stages.technoTower   & 0o7) << 12
		                  | (this.scenario.stages.marinaMadness & 0o7) << 9
		                  | (this.scenario.character            & 0o7) << 6
		                  | (this.scenario.timeOfDay            & 0o7) << 3
		                  | (changeNext                         & 0o7);

		const {hr, min, sec, tick} = this.scenario.playTime;
		const playTime = hr * 60 * 60 * 64 + min * 60 * 64 + sec * 64 + tick;

		writeBytes(ATTRACTIONS_OFFSET, 3, attractions);
		writeBytes(CHAOS_RINGS_OFFSET, 1, this.scenario.chaosRings);
		writeBytes(SCORE_OFFSET,       4, this.scenario.score);
		writeBytes(PLAY_TIME_OFFSET,   4, playTime);
	}

	this.isEmpty = !file.some(function(value) {
		return value > 0;
	});

	return file;

	function writeBytes(pos, length, value) {
		for (let i = 0; i < length; i++) {
			const shift = 8 * (length - i - 1);
			file[pos + i] = (value >> shift) & 0xff;
		}
	}
};

/*
 * Storage prototype
 */

function Storage(name) {
	this.name = name;
}

Storage.prototype.load = function() {
	try {
		const contents = localStorage.getItem(this.name);

		if (contents != null) {
			return JSON.parse(contents);
		}
	} catch (err) {
		console.error(err);
		this.reset();
	}

	return {};
};

Storage.prototype.save = function(file) {
	try {
		if (file != undefined) {
			localStorage.setItem(this.name, JSON.stringify(file));
		} else {
			this.reset();
		}
	} catch (err) {
		console.error(err);
	}
};

Storage.prototype.reset = function() {
	try {
		localStorage.removeItem(this.name);
	} catch (err) {
		console.error(err);
	}
};