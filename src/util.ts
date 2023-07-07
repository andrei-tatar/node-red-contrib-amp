export function timeSpan(value: number, unit: 'day' | 'hour' | 'min' | 'sec') {
    if (unit === 'day') {
        value *= 24;
        unit = 'hour';
    }

    if (unit === 'hour') {
        value *= 60;
        unit = 'min';
    }

    if (unit === 'min') {
        value *= 60;
        unit = 'sec';
    }

    return value * 1000;
}
