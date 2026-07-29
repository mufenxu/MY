package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.Mint
import cn.pxyb.mycontrol.ui.theme.MintPale

private data class TabItem(val tab: MainTab, val label: String, val icon: ImageVector)

private val tabs = listOf(
    TabItem(MainTab.Overview, "总览", Icons.Outlined.Dashboard),
    TabItem(MainTab.Events, "事件", Icons.Outlined.Notifications),
    TabItem(MainTab.Operations, "操作", Icons.Outlined.RocketLaunch),
    TabItem(MainTab.Tools, "工具", Icons.Outlined.GridView),
    TabItem(MainTab.Profile, "我的", Icons.Outlined.Person),
)

@Composable
fun MyControlApp(
    viewModel: AppViewModel,
    onBiometricUnlock: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    when {
        state.booting -> FullScreenLoading()
        state.locked -> LockScreen(onBiometricUnlock, viewModel::discardLockedSession)
        state.user == null -> LoginScreen(state, viewModel::login)
        else -> AuthenticatedShell(state, viewModel)
    }
}

@Composable
private fun FullScreenLoading() {
    Box(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark()
            CircularProgressIndicator(modifier = Modifier.padding(top = 22.dp).size(24.dp), strokeWidth = 2.5.dp)
        }
    }
}

@Composable
private fun LockScreen(onUnlock: () -> Unit, onUseLogin: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 28.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(compact = true)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(color = MintPale, shape = MaterialTheme.shapes.medium) {
                Icon(
                    Icons.Outlined.Fingerprint,
                    contentDescription = null,
                    tint = Forest,
                    modifier = Modifier.padding(20.dp).size(44.dp),
                )
            }
            Text("欢迎回来", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 22.dp))
            Text(
                "验证设备身份以继续",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
            Button(onClick = onUnlock, modifier = Modifier.fillMaxWidth().padding(top = 26.dp).height(52.dp)) {
                Icon(Icons.Outlined.Fingerprint, contentDescription = null)
                Text("解锁", modifier = Modifier.padding(start = 8.dp))
            }
            OutlinedButton(onClick = onUseLogin, modifier = Modifier.fillMaxWidth().padding(top = 10.dp).height(50.dp)) {
                Text("改用平台账号登录")
            }
        }
        Text(
            "MY Control · 安全会话已加密",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LoginScreen(state: AppUiState, onLogin: (String, String, String) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var factor by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val submit = { focusManager.clearFocus(); onLogin(username, password, factor) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 28.dp),
    ) {
        BrandMark()
        Spacer(Modifier.height(46.dp))
        IconTile(Icons.Outlined.Security, Forest, MintPale, modifier = Modifier.size(48.dp))
        Text("登录统一平台", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 18.dp))
        Text(
            "使用管理控制台账号",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 5.dp, bottom = 24.dp),
        )
        if (!state.error.isNullOrBlank()) {
            FeedbackBanner(state.error, error = true, modifier = Modifier.padding(bottom = 14.dp))
        }
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("平台账号") },
            singleLine = true,
            enabled = !state.loginBusy,
            leadingIcon = { Icon(Icons.Outlined.Person, contentDescription = null) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            label = { Text("密码") },
            singleLine = true,
            enabled = !state.loginBusy,
            leadingIcon = { Icon(Icons.Outlined.Lock, contentDescription = null) },
            trailingIcon = {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(
                        if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                        contentDescription = if (passwordVisible) "隐藏密码" else "显示密码",
                    )
                }
            },
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
        )
        if (state.secondFactorRequired || factor.isNotBlank()) {
            OutlinedTextField(
                value = factor,
                onValueChange = { factor = it.filter(Char::isDigit).take(6) },
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                label = { Text("动态验证码") },
                singleLine = true,
                enabled = !state.loginBusy,
                leadingIcon = { Icon(Icons.Outlined.Security, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
        }
        Button(
            onClick = submit,
            enabled = !state.loginBusy && username.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth().padding(top = 20.dp).height(52.dp),
        ) {
            if (state.loginBusy) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            } else {
                Icon(Icons.Outlined.Lock, contentDescription = null)
            }
            Text(if (state.secondFactorRequired) "验证并登录" else "安全登录", modifier = Modifier.padding(start = 8.dp))
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Outlined.Security, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
            Text(
                "密码仅用于本次验证",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedShell(state: AppUiState, viewModel: AppViewModel) {
    val snackbarHost = remember { SnackbarHostState() }
    LaunchedEffect(state.error, state.message) {
        val text = state.error ?: state.message
        if (!text.isNullOrBlank()) {
            snackbarHost.showSnackbar(text)
            viewModel.clearFeedback()
        }
    }
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets.safeDrawing,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHost) },
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(tabTitle(state.selectedTab), style = MaterialTheme.typography.titleMedium)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(6.dp).background(Mint, MaterialTheme.shapes.extraSmall))
                            Text(
                                "生产环境",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 5.dp),
                            )
                        }
                    }
                },
                navigationIcon = {
                    Surface(
                        modifier = Modifier.padding(start = 12.dp).size(36.dp),
                        color = Forest,
                        contentColor = Mint,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("MY", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refreshAll(true) }, enabled = !state.refreshing) {
                        if (state.refreshing) CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Outlined.Refresh, contentDescription = "刷新")
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                tabs.forEach { item ->
                    NavigationBarItem(
                        selected = state.selectedTab == item.tab,
                        onClick = { viewModel.selectTab(item.tab) },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        when (state.selectedTab) {
            MainTab.Overview -> OverviewScreen(state, padding, viewModel::selectTab)
            MainTab.Events -> EventsScreen(state, padding, viewModel::acknowledgeIncident)
            MainTab.Operations -> OperationsScreen(state, padding, viewModel::runDiagnostics, viewModel::triggerBackup)
            MainTab.Tools -> ToolsScreen(state, padding, viewModel::triggerCt8, viewModel::runIotScene)
            MainTab.Profile -> ProfileScreen(state, padding, viewModel::revokeSession, viewModel::logout)
        }
    }
}

@Composable
private fun BrandMark(compact: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(color = Forest, contentColor = Mint, shape = MaterialTheme.shapes.small) {
            Box(Modifier.size(if (compact) 38.dp else 44.dp), contentAlignment = Alignment.Center) {
                Text("MY", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
        }
        Column {
            Text("MY Control", style = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge)
            if (!compact) Text("统一平台", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun tabTitle(tab: MainTab): String = when (tab) {
    MainTab.Overview -> "运行总览"
    MainTab.Events -> "事件中心"
    MainTab.Operations -> "执行中心"
    MainTab.Tools -> "平台工具"
    MainTab.Profile -> "账号与安全"
}

fun screenPadding(contentPadding: PaddingValues): Modifier = Modifier
    .fillMaxSize()
    .padding(contentPadding)
