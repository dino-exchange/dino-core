// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.6.12;

import './interfaces/IBEP20.sol';
import './libraries/SafeMath.sol';
import './libraries/SafeBEP20.sol';
import './libraries/Ownable.sol';

interface IMigratorDens {
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    function migrate(IBEP20 token) external returns (IBEP20);
}

interface IDinoTreasury {
    function claim() external returns (uint256);
}

// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once DINO is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract DinoDens is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of DINOs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accDinoPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accDinoPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. DINOs to distribute per block.
        uint256 lastRewardBlock; // Last block number that DINOs distribution occurs.
        uint256 accDinoPerShare; // Accumulated DINOs per share, times 1e12. See below.
    }

    // The DINO TOKEN!
    IBEP20 public dino;
    // The treasury contract
    IDinoTreasury public treasury;
    // Dev address.
    address public devaddr;
    // DINO tokens created per block.
    uint256 public dinoPerBlock;
    // Last block number that dens claims DINO tokens.
    uint256 public lastClaimDinoBlock;
    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    IMigratorDens public migrator;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when DINO mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(
        IBEP20 _dino,
        IDinoTreasury _treasury,
        address _devaddr,
        uint256 _startBlock
    ) public {
        dino = _dino;
        treasury = _treasury;
        devaddr = _devaddr;
        startBlock = _startBlock;

        // staking pool
        poolInfo.push(PoolInfo({lpToken: _dino, allocPoint: 1000, lastRewardBlock: startBlock, accDinoPerShare: 0}));
        dinoPerBlock = treasury.claim();
        lastClaimDinoBlock = block.number;
        totalAllocPoint = 1000;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IBEP20 _lpToken,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({lpToken: _lpToken, allocPoint: _allocPoint, lastRewardBlock: lastRewardBlock, accDinoPerShare: 0})
        );
        updateStakingPool();
    }

    // Update the given pool's DINO allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(_allocPoint);
            updateStakingPool();
        }
    }

    function updateStakingPool() internal {
        uint256 length = poolInfo.length;
        uint256 points = 0;
        for (uint256 pid = 1; pid < length; ++pid) {
            points = points.add(poolInfo[pid].allocPoint);
        }
        if (points != 0) {
            points = points.div(3);
            totalAllocPoint = totalAllocPoint.sub(poolInfo[0].allocPoint).add(points);
            poolInfo[0].allocPoint = points;
        }
    }

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorDens _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), 'migrate: no migrator');
        PoolInfo storage pool = poolInfo[_pid];
        IBEP20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IBEP20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), 'migrate: bad');
        pool.lpToken = newLpToken;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public pure returns (uint256) {
        return _to.sub(_from);
    }

    // View function to see pending DINOs on frontend.
    function pendingDino(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accDinoPerShare = pool.accDinoPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 dinoReward = multiplier.mul(dinoPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accDinoPerShare = accDinoPerShare.add(dinoReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accDinoPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        if (lastClaimDinoBlock < block.number) {
            dinoPerBlock = treasury.claim().div(block.number.sub(lastClaimDinoBlock));
            lastClaimDinoBlock = block.number;
        }

        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 dinoReward = multiplier.mul(dinoPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        dino.transfer(devaddr, dinoReward.div(10));
        pool.accDinoPerShare = pool.accDinoPerShare.add(dinoReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to DinoDens for DINO allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        require(_pid != 0, 'deposit DINO by staking');

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accDinoPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                safeDinoTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accDinoPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from DinoDens.
    function withdraw(uint256 _pid, uint256 _amount) public {
        require(_pid != 0, 'withdraw DINO by unstaking');
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, 'withdraw: not good');

        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accDinoPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            safeDinoTransfer(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accDinoPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Stake DINO tokens to DinoDens
    function enterStaking(uint256 _amount) public {
        PoolInfo storage pool = poolInfo[0];
        UserInfo storage user = userInfo[0][msg.sender];
        updatePool(0);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accDinoPerShare).div(1e12).sub(user.rewardDebt);
            if (pending > 0) {
                safeDinoTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accDinoPerShare).div(1e12);

        emit Deposit(msg.sender, 0, _amount);
    }

    // Withdraw DINO tokens from STAKING.
    function leaveStaking(uint256 _amount) public {
        PoolInfo storage pool = poolInfo[0];
        UserInfo storage user = userInfo[0][msg.sender];
        require(user.amount >= _amount, 'withdraw: not good');
        updatePool(0);
        uint256 pending = user.amount.mul(pool.accDinoPerShare).div(1e12).sub(user.rewardDebt);
        if (pending > 0) {
            safeDinoTransfer(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accDinoPerShare).div(1e12);

        emit Withdraw(msg.sender, 0, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe dino transfer function, just in case if rounding error causes pool to not have enough DINOs.
    function safeDinoTransfer(address _to, uint256 _amount) internal {
        uint256 dinoBal = dino.balanceOf(address(this));
        if (_amount > dinoBal) {
            dino.transfer(_to, dinoBal);
        } else {
            dino.transfer(_to, _amount);
        }
    }

    // Update dev address by the previous dev.
    function dev(address _devaddr) public {
        require(msg.sender == devaddr, 'dev: wut?');
        devaddr = _devaddr;
    }
}
