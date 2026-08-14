import { config } from "../config/index.js";
import { LogLevel } from "../models/index.js";

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const getCurrentLogLevel = (): LogLevel => {
	const envLogLevel = config.debug?.logLevel?.toLowerCase() as LogLevel;
	if (
		envLogLevel === "debug" ||
		envLogLevel === "info" ||
		envLogLevel === "warn" ||
		envLogLevel === "error"
	) {
		return envLogLevel;
	}
	// Default to "info" if not set or invalid
	return "info";
};

const shouldLog = (messageLevel: LogLevel): boolean => {
	const currentLevel = getCurrentLogLevel();
	return (
		LOG_LEVEL_PRIORITIES[messageLevel] >= LOG_LEVEL_PRIORITIES[currentLevel]
	);
};

const logger = {
	debug: (...args: unknown[]) => {
		if (shouldLog("debug")) {
			console.debug(...args);
		}
	},
	info: (...args: unknown[]) => {
		if (shouldLog("info")) {
			console.info(...args);
		}
	},
	warn: (...args: unknown[]) => {
		if (shouldLog("warn")) {
			console.warn(...args);
		}
	},
	error: (...args: unknown[]) => {
		if (shouldLog("error")) {
			console.error(...args);
		}
	},
};

export default logger;
