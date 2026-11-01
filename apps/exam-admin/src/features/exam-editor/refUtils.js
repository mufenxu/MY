/**
 * ref / computed 判定
 *
 * Vue 的 RefImpl 把 value 定义在原型访问器上，`hasOwnProperty('value')` 会漏判，
 * 进而把整个 ref 当作普通值传下去（例如把 ref 当数组 forEach）。统一用 in 判断。
 */

export function isRefLike(value) {
    return Boolean(value && typeof value === 'object' && 'value' in value);
}

export function refValue(value) {
    return isRefLike(value) ? value.value : value;
}
