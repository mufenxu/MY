import useSWR from 'swr';
import api from '../utils/api';

const fetcher = (url) => api.get(url).then((res) => res.data);

export function useUsers(page = 1, pageSize = 20, filters = {}) {
    const queryParams = new URLSearchParams({
        page,
        pageSize,
        ...filters,
    }).toString();

    const { data, error, isLoading, isValidating, mutate } = useSWR(`/users?${queryParams}`, fetcher);

    return {
        users: data?.items || [],
        total: data?.total || 0,
        loading: isLoading,
        isLoading,
        isValidating,
        isError: error,
        mutate,
    };
}

export function useCurrentUser() {
    const { data, error, isLoading, mutate } = useSWR('/users/me', fetcher);

    return {
        user: data?.user,
        isLoading,
        isError: error,
        mutate,
    };
}
