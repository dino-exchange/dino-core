// SPDX-License-Identifier: MIT
pragma solidity =0.6.12;

import './libraries/SafeBEP20.sol';
import './libraries/SafeMath.sol';
import './libraries/Ownable.sol';
import './libraries/Pausable.sol';
import './interfaces/IBEP20.sol';

interface IDinoTreasury {
    function claim() external returns (uint256);
}

contract DinoVault is Ownable, Pausable {
    using SafeBEP20 for IBEP20;
    using SafeMath for uint256;

    struct UserAutoInfo {
        uint256 shares; // number of shares for a user
        uint256 lastDepositedTime; // keeps track of deposited time for potential penalty
        uint256 dinoAtLastUserAction; // keeps track of dino deposited at the last user action
        uint256 lastUserActionTime; // keeps track of the last user action time
    }

    struct UserManualInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
    }

    // For manual pool
    mapping(address => UserManualInfo) public userManualInfo;

    uint256 public dinoPerBlock; // DINO tokens created per block.
    uint256 public lastClaimDinoBlock; // Last block number that dens claims DINO tokens.
    uint256 lastRewardBlock; // Last block number that DINOs distribution occurs.
    uint256 accDinoPerShare; // Accumulated DINOs per share, times 1e12. See below.
    uint256 public startBlock; // The block number when DINO mining starts.

    // For auto pool
    mapping(address => UserAutoInfo) public userAutoInfo;

    uint256 public totalShares;
    uint256 public lastHarvestedTime;
    address public admin;
    address public feeTo;

    uint256 public constant MAX_PERFORMANCE_FEE = 500; // 5%
    uint256 public constant MAX_CALL_FEE = 100; // 1%
    uint256 public constant MAX_WITHDRAW_FEE = 100; // 1%
    uint256 public constant MAX_WITHDRAW_FEE_PERIOD = 72 hours; // 3 days

    uint256 public performanceFee = 100; // 1%
    uint256 public callFee = 25; // 0.25%
    uint256 public withdrawFee = 20; // 0.2%
    uint256 public withdrawFeePeriod = 48 hours; // 2 days

    event DepositAutoPool(address indexed sender, uint256 amount, uint256 shares, uint256 lastDepositedTime);
    event WithdrawAutoPool(address indexed sender, uint256 amount, uint256 shares);
    event HarvestAutoPool(address indexed sender, uint256 performanceFee, uint256 callFee);
    event DepositManualPool(address indexed user, uint256 amount);
    event WithdrawManualPool(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event Pause();
    event Unpause();

    IBEP20 public token; // Dino token
    IDinoTreasury public treasury; // The treasury contract
    uint256 public totalPoolBalance;
    uint256 public autoPoolPending;

    /**
     * @notice Constructor
     * @param _token: Dino token contract
     * @param _treasury: Dino treasury contract
     * @param _startBlock: start staking block
     * @param _feeTo: address to collects fees
     */
    constructor(
        IBEP20 _token,
        IDinoTreasury _treasury,
        uint256 _startBlock,
        address _feeTo
    ) public {
        token = _token;
        treasury = _treasury;
        startBlock = _startBlock;
        admin = msg.sender;
        feeTo = _feeTo;

        dinoPerBlock = treasury.claim();
        lastClaimDinoBlock = block.number;
    }

    /**
     * @notice Checks if the msg.sender is the admin address
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, 'admin: wut?');
        _;
    }

    /**
     * @notice Checks if the msg.sender is a contract or a proxy
     */
    modifier notContract() {
        require(!_isContract(msg.sender), 'contract not allowed');
        require(msg.sender == tx.origin, 'proxy contract not allowed');
        _;
    }

    // Update reward variables of the manual pool to be up-to-date.
    function updateManualPool() public {
        if (lastClaimDinoBlock < block.number) {
            dinoPerBlock = treasury.claim().div(block.number.sub(lastClaimDinoBlock));
            lastClaimDinoBlock = block.number;
        }
        if (block.number <= lastRewardBlock) {
            return;
        }
        uint256 lpSupply = totalPoolBalance;
        if (lpSupply == 0) {
            lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = block.number.sub(lastRewardBlock);
        uint256 dinoReward = multiplier.mul(dinoPerBlock);
        accDinoPerShare = accDinoPerShare.add(dinoReward.mul(1e12).div(lpSupply));
        lastRewardBlock = block.number;
    }

    // View function to see pending DINOs on frontend.
    function pendingManual(address _user) public view returns (uint256) {
        UserManualInfo storage user = userManualInfo[_user];
        uint256 _accDinoPerShare = accDinoPerShare;
        uint256 lpSupply = totalPoolBalance;
        if (block.number > lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = block.number.sub(lastRewardBlock);
            uint256 dinoReward = multiplier.mul(dinoPerBlock);
            _accDinoPerShare = _accDinoPerShare.add(dinoReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(_accDinoPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Stake DINO tokens to DinoDens
    function depositManual(uint256 _amount) public {
        UserManualInfo storage user = userManualInfo[msg.sender];
        updateManualPool();
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(accDinoPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                _safeDinoTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            token.safeTransferFrom(address(msg.sender), address(this), _amount);
            totalPoolBalance = totalPoolBalance.add(_amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(accDinoPerShare).div(1e12);

        emit DepositManualPool(msg.sender, _amount);
    }

    // Withdraw DINO tokens from STAKING.
    function withdrawManual(uint256 _amount) public {
        UserManualInfo storage user = userManualInfo[msg.sender];
        require(user.amount >= _amount, 'withdraw: not good');
        updateManualPool();
        uint256 pending = user.amount.mul(accDinoPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            _safeDinoTransfer(msg.sender, pending);
        }
        if (_amount > 0) {
            totalPoolBalance = totalPoolBalance.sub(_amount);
            user.amount = user.amount.sub(_amount);
            token.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(accDinoPerShare).div(1e12);

        emit WithdrawManualPool(msg.sender, _amount);
    }

    /**
     * @notice Deposits funds into the Dino Vault
     * @dev Only possible when contract not paused.
     * @param _amount: number of tokens to deposit (in DINO)
     */
    function depositAuto(uint256 _amount) external whenNotPaused notContract {
        require(_amount > 0, 'Nothing to deposit');

        uint256 pool = balanceOf();
        token.safeTransferFrom(msg.sender, address(this), _amount);
        autoPoolPending = autoPoolPending.add(_amount);
        uint256 currentShares = 0;
        if (totalShares != 0) {
            currentShares = (_amount.mul(totalShares)).div(pool);
        } else {
            currentShares = _amount;
        }
        UserAutoInfo storage user = userAutoInfo[msg.sender];

        user.shares = user.shares.add(currentShares);
        user.lastDepositedTime = block.timestamp;

        totalShares = totalShares.add(currentShares);

        user.dinoAtLastUserAction = user.shares.mul(balanceOf()).div(totalShares);
        user.lastUserActionTime = block.timestamp;

        _earn();

        emit DepositAutoPool(msg.sender, _amount, currentShares, block.timestamp);
    }

    /**
     * @notice Withdraws all funds for a user
     */
    function withdrawAll() external notContract {
        withdraw(userAutoInfo[msg.sender].shares);
    }

    /**
     * @notice Reinvests DINO tokens into DinoDens
     * @dev Only possible when contract not paused.
     */
    function harvest() external notContract whenNotPaused {
        // Harvest from manual pool
        UserManualInfo storage user = userManualInfo[address(this)];
        updateManualPool();
        uint256 pending = user.amount.mul(accDinoPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            autoPoolPending = autoPoolPending.add(pending);
        }
        user.rewardDebt = user.amount.mul(accDinoPerShare).div(1e12);

        uint256 bal = available();
        uint256 currentPerformanceFee = bal.mul(performanceFee).div(10000);
        token.safeTransfer(feeTo, currentPerformanceFee);
        autoPoolPending = autoPoolPending.sub(currentPerformanceFee);

        uint256 currentCallFee = bal.mul(callFee).div(10000);
        token.safeTransfer(msg.sender, currentCallFee);
        autoPoolPending = autoPoolPending.sub(currentCallFee);
        
        _earn();

        lastHarvestedTime = block.timestamp;

        emit HarvestAutoPool(msg.sender, currentPerformanceFee, currentCallFee);
    }

    /**
     * @notice Sets admin address
     * @dev Only callable by the contract owner.
     */
    function setAdmin(address _admin) external onlyOwner {
        require(_admin != address(0), 'Cannot be zero address');
        admin = _admin;
    }

    /**
     * @notice Sets feeTo address
     * @dev Only callable by the contract owner.
     */
    function setFeeTo(address _feeTo) external onlyOwner {
        require(_feeTo != address(0), 'Cannot be zero address');
        feeTo = _feeTo;
    }

    /**
     * @notice Sets treasury address
     * @dev Only callable by the contract owner.
     */
    function setTreasury(IDinoTreasury _treasury) external onlyOwner {
        require(address(_treasury) != address(0), 'Cannot be zero address');
        treasury = _treasury;
    }

    /**
     * @notice Sets token address
     * @dev Only callable by the contract owner.
     */
    function setToken(IBEP20 _token) external onlyOwner {
        require(address(_token) != address(0), 'Cannot be zero address');
        token = _token;
    }

    /**
     * @notice Sets performance fee
     * @dev Only callable by the contract admin.
     */
    function setPerformanceFee(uint256 _performanceFee) external onlyAdmin {
        require(_performanceFee <= MAX_PERFORMANCE_FEE, 'performanceFee cannot be more than MAX_PERFORMANCE_FEE');
        performanceFee = _performanceFee;
    }

    /**
     * @notice Sets call fee
     * @dev Only callable by the contract admin.
     */
    function setCallFee(uint256 _callFee) external onlyAdmin {
        require(_callFee <= MAX_CALL_FEE, 'callFee cannot be more than MAX_CALL_FEE');
        callFee = _callFee;
    }

    /**
     * @notice Sets withdraw fee
     * @dev Only callable by the contract admin.
     */
    function setWithdrawFee(uint256 _withdrawFee) external onlyAdmin {
        require(_withdrawFee <= MAX_WITHDRAW_FEE, 'withdrawFee cannot be more than MAX_WITHDRAW_FEE');
        withdrawFee = _withdrawFee;
    }

    /**
     * @notice Sets withdraw fee period
     * @dev Only callable by the contract admin.
     */
    function setWithdrawFeePeriod(uint256 _withdrawFeePeriod) external onlyAdmin {
        require(
            _withdrawFeePeriod <= MAX_WITHDRAW_FEE_PERIOD,
            'withdrawFeePeriod cannot be more than MAX_WITHDRAW_FEE_PERIOD'
        );
        withdrawFeePeriod = _withdrawFeePeriod;
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw() public {
        UserManualInfo storage user = userManualInfo[msg.sender];
        token.safeTransfer(address(msg.sender), user.amount);
        totalPoolBalance = totalPoolBalance.sub(user.amount);
        emit EmergencyWithdraw(msg.sender, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    /**
     * @notice Withdraw unexpected tokens sent to the Dino Vault
     */
    function inCaseTokensGetStuck(address _token) external onlyAdmin {
        require(_token != address(token), 'Token cannot be same as deposit token');

        uint256 amount = IBEP20(_token).balanceOf(address(this));
        IBEP20(_token).safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Triggers stopped state
     * @dev Only possible when contract not paused.
     */
    function pause() external onlyAdmin whenNotPaused {
        _pause();
        emit Pause();
    }

    /**
     * @notice Returns to normal state
     * @dev Only possible when contract is paused.
     */
    function unpause() external onlyAdmin whenPaused {
        _unpause();
        emit Unpause();
    }

    /**
     * @notice Calculates the expected harvest reward from third party
     * @return Expected reward to collect in DINO
     */
    function calculateHarvestDinoRewards() external view returns (uint256) {
        uint256 amount = pendingManual(address(this));
        amount = amount.add(available());
        uint256 currentCallFee = amount.mul(callFee).div(10000);

        return currentCallFee;
    }

    /**
     * @notice Calculates the total pending rewards that can be restaked
     * @return Returns total pending dino rewards
     */
    function calculateTotalPendingDinoRewards() external view returns (uint256) {
        uint256 amount = pendingManual(address(this));
        amount = amount.add(available());

        return amount;
    }

    /**
     * @notice Calculates the price per share
     */
    function getPricePerFullShare() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : balanceOf().mul(1e18).div(totalShares);
    }

    /**
     * @notice Withdraws from funds from the Dino Vault
     * @param _shares: Number of shares to withdraw
     */
    function withdraw(uint256 _shares) public notContract {
        UserAutoInfo storage user = userAutoInfo[msg.sender];
        require(_shares > 0, 'Nothing to withdraw');
        require(_shares <= user.shares, 'Withdraw amount exceeds balance');

        uint256 currentAmount = (balanceOf().mul(_shares)).div(totalShares);
        user.shares = user.shares.sub(_shares);
        totalShares = totalShares.sub(_shares);

        uint256 bal = available();
        if (bal < currentAmount) {
            uint256 balWithdraw = currentAmount.sub(bal);
            // Withdraw from manual pool
            UserManualInfo storage pool = userManualInfo[address(this)];
            require(pool.amount >= balWithdraw, 'withdraw: not good');
            updateManualPool();
            uint256 pending = pool.amount.mul(accDinoPerShare).div(1e12).sub(pool.rewardDebt);
            if (pending > 0) {
                autoPoolPending = autoPoolPending.add(pending);
            }
            totalPoolBalance = totalPoolBalance.sub(balWithdraw);
            autoPoolPending = autoPoolPending.add(balWithdraw);
            pool.amount = pool.amount.sub(balWithdraw);
            pool.rewardDebt = pool.amount.mul(accDinoPerShare).div(1e12);

            uint256 balAfter = available();
            uint256 diff = balAfter.sub(bal);
            if (diff < balWithdraw) {
                currentAmount = bal.add(diff);
            }
        }

        if (block.timestamp < user.lastDepositedTime.add(withdrawFeePeriod)) {
            uint256 currentWithdrawFee = currentAmount.mul(withdrawFee).div(10000);
            token.safeTransfer(feeTo, currentWithdrawFee);
            autoPoolPending = autoPoolPending.sub(currentWithdrawFee);
            currentAmount = currentAmount.sub(currentWithdrawFee);
        }

        if (user.shares > 0) {
            user.dinoAtLastUserAction = user.shares.mul(balanceOf()).div(totalShares);
        } else {
            user.dinoAtLastUserAction = 0;
        }

        user.lastUserActionTime = block.timestamp;

        token.safeTransfer(msg.sender, currentAmount);
        autoPoolPending = autoPoolPending.sub(currentAmount);

        emit WithdrawAutoPool(msg.sender, currentAmount, _shares);
    }

    // Safe dino transfer function, just in case if rounding error causes pool to not have enough DINOs.
    function _safeDinoTransfer(address _to, uint256 _amount) internal {
        uint256 dinoBal = token.balanceOf(address(this));
        if (_amount > dinoBal) {
            token.transfer(_to, dinoBal);
        } else {
            token.transfer(_to, _amount);
        }
    }

    /**
     * @notice Custom logic for how much the vault allows to be borrowed
     * @dev The contract puts 100% of the tokens to work.
     */
    function available() public view returns (uint256) {
        return autoPoolPending;
    }

    /**
     * @notice Calculates the total underlying tokens
     * @dev It includes tokens held by the contract and held in MasterChef
     */
    function balanceOf() public view returns (uint256) {
        UserManualInfo storage pool = userManualInfo[address(this)];
        return pool.amount.add(autoPoolPending);
    }

    /**
     * @notice Deposits tokens into DinoDens to earn staking rewards
     */
    function _earn() internal {
        uint256 bal = available();
        if (bal > 0) {
            UserManualInfo storage user = userManualInfo[address(this)];
            updateManualPool();
            if (user.amount > 0) {
                uint256 pending = user.amount.mul(accDinoPerShare).div(1e12).sub(user.rewardDebt);
                if (pending > 0) {
                    autoPoolPending = autoPoolPending.add(pending);
                }
            }
            totalPoolBalance = totalPoolBalance.add(bal);
            autoPoolPending = autoPoolPending.sub(bal);
            user.amount = user.amount.add(bal);
            user.rewardDebt = user.amount.mul(accDinoPerShare).div(1e12);
        }
    }

    /**
     * @notice Checks if address is a contract
     * @dev It prevents contract from being targetted
     */
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
