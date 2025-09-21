/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * client.tsx
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

'use client'

import type {AppRouter} from '@libra/api'
import type {QueryClient} from '@tanstack/react-query'
import {QueryClientProvider} from '@tanstack/react-query'
import {ReactQueryDevtools} from '@tanstack/react-query-devtools'
import {createTRPCClient, httpBatchStreamLink, loggerLink} from '@trpc/client'
import {createTRPCContext} from '@trpc/tanstack-react-query'
import {useState} from 'react'
import SuperJSON from 'superjson'
import {env} from '../env.mjs'
import {createQueryClient} from './query-client'

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
    if (typeof window === "undefined") {
        // Server: always make a new query client
        return createQueryClient();
    }
    // Client: use singleton pattern
    if (clientQueryClientSingleton === undefined) {
        clientQueryClientSingleton = createQueryClient();
    }
    return clientQueryClientSingleton;
};

export const {useTRPC, TRPCProvider} = createTRPCContext<AppRouter>();

export function TRPCReactProvider(props: { children: React.ReactNode }) {
    const queryClient = getQueryClient();

    const [trpcClient] = useState(() =>
        createTRPCClient<AppRouter>({
            links: [
                loggerLink({
                    enabled: (op) =>
                        process.env.NODE_ENV === "development" ||
                        (op.direction === "down" && op.result instanceof Error),
                }),
                httpBatchStreamLink({
                    transformer: SuperJSON,
                    url: `${getBaseUrl()}/api/trpc`,
                    headers() {
                        const headers = new Headers();
                        headers.set("x-trpc-source", "next-react");
                        return headers;
                    },
                }),
            ],
        }),
    );

    return (
        <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
                {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={true}/>}
                {props.children}
            </TRPCProvider>
        </QueryClientProvider>
    );
}

const getBaseUrl = () => {
    if (typeof window !== 'undefined') return window.location.origin
    if (process.env.NEXT_PUBLIC_APP_URL) return `https://${env.NEXT_PUBLIC_APP_URL}`
    return `http://localhost:${process.env.PORT ?? 3000}`
}