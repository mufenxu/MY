package cn.pxyb.mycontrol.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AccountStorageScopeTest {
    @Test
    fun `same account uses the same opaque scope`() {
        assertEquals(
            accountStorageScope(" Admin "),
            accountStorageScope("admin"),
        )
    }

    @Test
    fun `different accounts never share scoped keys`() {
        assertNotEquals(
            scopedStorageKey("alice", "todos"),
            scopedStorageKey("bob", "todos"),
        )
    }

    @Test
    fun `unknown account cannot address cached data`() {
        assertNull(scopedStorageKey("   ", "todos"))
        assertNull(scopedStorageKey(null, "todos"))
    }
}
