package cn.pxyb.mycontrol.ui.feature.envreference

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EnvReferenceCatalogTest {
    private val all = envReferenceGroups.flatMap { it.variables }

    @Test
    fun everyVariableIsUniqueAndDescribed() {
        assertEquals(all.size, all.map { it.key }.toSet().size)
        assertEquals(envReferenceGroups.size, envReferenceGroups.map { it.id }.toSet().size)
        assertEquals(envReferenceGroups.size, envReferenceGroups.map { it.title }.toSet().size)
        all.forEach { variable ->
            assertTrue(variable.key, variable.title.isNotBlank() && variable.purpose.isNotBlank())
        }
    }

    @Test
    fun secretsNeverCarryAnExampleValue() {
        assertTrue(all.filter { it.sensitive }.all { it.example == null })
    }

    @Test
    fun queryMatchesKeyTitleAndPurposeIgnoringCase() {
        fun keys(query: String) = filterEnvGroups(envReferenceGroups, query, null, EnvKindFilter.All)
            .flatMap { it.variables }.map { it.key }

        assertEquals(listOf("MQTT_CLIENT_ID"), keys("  mqtt_client_id "))
        assertTrue("MONGO_REPLICA_SET_KEY" in keys("副本集内部认证"))
        assertTrue("PLATFORM_BACKUP_SCHEDULE_TIME" in keys("backup 时间"))
        assertTrue(keys("这个关键字不存在").isEmpty())
    }

    @Test
    fun groupAndKindFiltersNarrowTheResult() {
        val mongoSecrets = filterEnvGroups(envReferenceGroups, "", "mongo", EnvKindFilter.Sensitive)

        assertEquals(listOf("mongo"), mongoSecrets.map { it.id })
        assertTrue(mongoSecrets.single().variables.all { it.sensitive })
        assertTrue(
            filterEnvGroups(envReferenceGroups, "", null, EnvKindFilter.Required)
                .flatMap { it.variables }.all { it.fill == EnvFill.Required },
        )
        assertTrue(filterEnvGroups(envReferenceGroups, "", "resources", EnvKindFilter.Sensitive).isEmpty())
    }
}
