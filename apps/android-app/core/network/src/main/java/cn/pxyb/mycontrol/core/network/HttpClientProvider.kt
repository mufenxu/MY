package cn.pxyb.mycontrol.core.network

import okhttp3.CertificatePinner
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * 全局共享的 OkHttpClient 提供者：统一连接池、超时、重试与证书固定，
 * 避免各调用方各自创建客户端导致连接池与调度器重复。
 */
object HttpClientProvider {

    private val certificatePinner = CertificatePinner.Builder()
        // pxyb.cn 改由 TrustAsia LiteSSL RSA CA 2025 签发：固定其中间 CA 与根 CA，
        // 叶子证书约 90 天轮换，不参与固定。此层不支持过期回退，
        // 更换 CA 厂商时必须与 network_security_config.xml 的 pin-set 同步更新，否则会再次中断所有请求。
        .add(
            "pxyb.cn",
            "sha256/Wt2ZC+IE3Cpf6hRflokHnxyZR+ZD82TqFkj1/fmYndc=",
            "sha256/ViiHLiRf5mFIuAut6snED2JS5kL6lZWuzks+ili4/UY=",
        )
        // 7n.pxyb.cn 由 TrustAsia 签发：固定其中间 CA(LiteSSL RSA CA 2025) 与根 CA。
        .add(
            "7n.pxyb.cn",
            "sha256/Wt2ZC+IE3Cpf6hRflokHnxyZR+ZD82TqFkj1/fmYndc=",
            "sha256/ViiHLiRf5mFIuAut6snED2JS5kL6lZWuzks+ili4/UY=",
        )
        .build()

    /** 共享客户端：默认 12s 连接 / 30s 读写超时，供常规接口调用复用。 */
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .callTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .connectionPool(ConnectionPool(5, 5, TimeUnit.MINUTES))
            .certificatePinner(certificatePinner)
            .build()
    }

    /** 基于统一配置创建可微调超时的客户端，与其他调用方共享同一连接池。 */
    fun newBuilder(): OkHttpClient.Builder = client.newBuilder()
}
