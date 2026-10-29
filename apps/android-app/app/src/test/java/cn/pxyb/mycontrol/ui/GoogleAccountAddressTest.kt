package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.feature.google.isValidGoogleAddress
import cn.pxyb.mycontrol.ui.feature.google.normalizeGoogleAddress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GoogleAccountAddressTest {
    @Test
    fun `addresses are compared in lowercase`() {
        assertEquals("me@example.com", normalizeGoogleAddress("  Me@Example.COM "))
    }

    @Test
    fun `a plain address is accepted`() {
        assertTrue(isValidGoogleAddress(normalizeGoogleAddress("me@example.com")))
        assertTrue(isValidGoogleAddress(normalizeGoogleAddress("first.last+tag@mail.example.edu.cn")))
    }

    @Test
    fun `malformed addresses are rejected`() {
        assertFalse(isValidGoogleAddress(normalizeGoogleAddress("me@example")))
        assertFalse(isValidGoogleAddress(normalizeGoogleAddress("@example.com")))
        assertFalse(isValidGoogleAddress(normalizeGoogleAddress("me@@example.com")))
        assertFalse(isValidGoogleAddress(normalizeGoogleAddress("me @example.com")))
        assertFalse(isValidGoogleAddress(normalizeGoogleAddress("me")))
    }
}
