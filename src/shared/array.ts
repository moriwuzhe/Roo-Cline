/**
 * 返回数组中最后一个使谓词为真的元素的索引，否则返回 -1。
 * @param array 要搜索的源数组
 * @param predicate findLastIndex 会为数组的每个元素调用一次谓词，从后向前，直到找到一个使谓词返回 true 的元素。
 * 如果找到这样的元素，findLastIndex 立即返回该元素的索引。否则，findLastIndex 返回 -1。
 */
export function findLastIndex<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): number {
	let l = array.length
	while (l--) {
		if (predicate(array[l], l, array)) {
			return l
		}
	}
	return -1
}

/**
 * 返回数组中最后一个使谓词为真的元素，否则返回 undefined。
 * @param array 要搜索的源数组
 * @param predicate findLast 会为数组的每个元素调用一次谓词，从后向前，直到找到一个使谓词返回 true 的元素。
 * 如果找到这样的元素，findLast 立即返回该元素。否则，findLast 返回 undefined。
 */
export function findLast<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined {
	const index = findLastIndex(array, predicate)
	return index === -1 ? undefined : array[index]
}
